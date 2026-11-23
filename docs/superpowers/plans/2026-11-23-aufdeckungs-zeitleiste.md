# Reveal Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One timeline per reveal owns every beat, the verdict sound, the roster announcement and the quiet rules; whatever judges a tip lands with the verdict, everywhere, enforced by one cross-game spec.

**Architecture:** `games/revealTimeline.ts` is provided by each `*Reveal.vue` and injected by its picture and table. Beats are a fixed sequence from one origin (arming); games with a story hold `verdict`. CSS gates on `reached(beat)` with delays relative to the beat; timers hang on `on(beat)`.

**Tech Stack:** Vue 3 (provide/inject, refs), Vitest + happy-dom + fake timers, Web Audio via `ui/verdictSound`.

**Spec:** `docs/superpowers/specs/2026-11-23-aufdeckungs-zeitleiste-design.md`

## Global Constraints

- Beats in order: `open` → `head` → `story` → `verdict` → `others`. None before its predecessor. (`settled` only if a consumer needs it.)
- `story` = `SOLUTION_DELAY_MS` (900) after `open`; `others` = `verdict` + `VERDICT_MS` (550); `head` early enough that last head cell + `FADE_MS` ≤ `story`.
- Quiet rules live only in the timeline: reload (`animate` false) → all beats at mount, silent; reduced motion → all beats at mount, verdict sound at once; background tab → all beats at mount, silent.
- `tickOfRow` unchanged: mine tick 0 on `verdict`; tick ≥ 1 on `others` at `(tick − 1) · rowStagger(n) + column · CELL_STAGGER_MS`.
- Guidelines (`frontend-state.md`, `game-lab.md`) updated in the task that changes the behaviour they describe. Commit rules per `CLAUDE.md`. Each commit runs `pnpm test`, `pnpm lint` (no warnings), `pnpm exec vue-tsc -b`.

## Review Focus

- A hold taken after `verdict` was reached (lab: same instance re-crossing the reveal) must not freeze or re-fire beats → Task 1 test.
- Unmount mid-story (Verrohrung water, Augenmaß count) cancels timers and a sounding verdict; no announce after unmount → Task 1 + Task 2 tests.
- Verrohrung name tap before the verdict: silent release, rows and roster come → Task 2 test.
- History cards (`animate` false) mounting during a roster hold never announce → Task 1 test.
- A registered game without a cross-game fixture fails the suite → Task 4 test.

---

### Task 1: The timeline

**Files:** create `webapp-vue/src/games/revealTimeline.ts`, `webapp-vue/src/games/__tests__/revealTimeline.spec.ts`; modify `games/revealChoreography.ts` (`HEAD_DELAY_MS`, add `othersDelayMs`, `headDelayMs` relative helpers).

**Produces:**
- `type Beat = 'open' | 'head' | 'story' | 'verdict' | 'others'`
- `provideRevealTimeline(options: { animate: boolean; won: () => boolean | null; judged?: 'before' }): RevealTimeline`
- `useRevealTimeline(): RevealTimeline` — throws without a provider.
- `interface RevealTimeline { readonly still: boolean; reached(beat: Beat): Readonly<Ref<boolean>>; on(beat: Beat, run: () => void): void; hold(): Hold }`
- `interface Hold { release(): void; releaseSilently(): void }`
- `othersDelayMs(tick: number, column: number, rowCount: number): number` = `(tick − 1) · rowStagger(rowCount) + column · CELL_STAGGER_MS`; `headDelayMs(row, column)` = `row · ROW_STAGGER_MS + column · CELL_STAGGER_MS`.

**Behaviour the tests pin:**
- [ ] Beats reach in order at `open` (two frames after mount), `head`, `story`, `verdict` (= `story` when no hold), `others` (= `verdict` + `VERDICT_MS`).
- [ ] `hold()` before `story`: `verdict` waits for every hold's release; `others` follows by `VERDICT_MS`.
- [ ] `releaseSilently()`: `verdict` reached, no `playVerdict`; any other hold still pending keeps waiting.
- [ ] `hold()` after `verdict` returns a no-op hold.
- [ ] `judged: 'before'`: `verdict` at `head`, no `playVerdict`.
- [ ] `playVerdict(won)` exactly once at `verdict` when `animate`, not in background, `won !== null`; still + `animate` → at mount; `animate` false → never.
- [ ] `announceResults()` at `verdict` only when `animate`; never for `animate` false.
- [ ] `on(beat, fn)` after the beat already passed runs `fn` at once; `still` reaches every beat during setup.
- [ ] Unmount clears timers and stops a sounding verdict; nothing fires afterwards.
- [ ] Commit: „Add a timeline for a reveal's beats“.

### Task 2: Every reveal provides; the verdict moves into the timeline

**Files:** every `games/*/*Reveal.vue` (+ their specs); delete `games/useRevealVerdict.ts`; `games/turnpipes/TurnPipesReveal.vue`, `games/matchscale/MatchScaleReveal.vue` + `countSound.ts` (`playCount` loses `won`), `games/deduster/DedusterReveal.vue`.

**Consumes:** Task 1.

- [ ] Each reveal calls `provideRevealTimeline({ animate: props.animate, won: () => props.won })` (Entstauber: `judged: 'before'`; Weltanschauung: `won: () => null`).
- [ ] Verrohrung: `hold()` at setup; `release()` after end sound + `VERDICT_GAP_MS`; a name tap before that → `releaseSilently()`. Its `playVerdict` and `held` go; until Task 3 its scoreboard reads `!reached('verdict')` for `resultsHeld`.
- [ ] Augenmaß: `hold()`; release at `growMs + FINALE_GAP` after `story`, computed from the tone plan; its own verdict scheduling goes. Specs: verdict exactly once, after the last count tone.
- [ ] Specs move from `useRevealVerdict` timing to the timeline's; the verdict-timing tests per game keep their intent (with my row; silent on reload/background; at once under reduced motion; cut on leaving).
- [ ] Commit: „Let the timeline play every reveal's verdict“.

### Task 3: The table on the timeline

**Files:** `games/RevealScoreboard.vue` (+ spec), `games/matchscale/MatchScaleScoreboard.vue`, `games/paintratio/PaintRatioScoreboard.vue`, `games/turnpipes/TurnPipesScoreboard.vue`; delete `ui/resultsLanding.ts`'s caller in the table (keep `afterResultsLand`/`announceResults` themselves).

- [ ] Specs: head cells on `head` with `headDelayMs`; fact cells (`fact-*`, „Lösung“, „Toleranz“, Kollektiv foot row, Augenmaß' head notes) on `verdict`; my row (tick 0) on `verdict`; tick ≥ 1 on `others` with `othersDelayMs`; each body row carries `data-test="row-<userId>"`.
- [ ] Props `animate`, `resultsDelayMs`, `resultsHeld` removed from `RevealScoreboard` and its wrappers; the table no longer announces.
- [ ] Commit: „Write the reveal table on the timeline's beats“.

### Task 4: Cross-game judging spec

**Files:** create `games/__tests__/revealJudging.spec.ts`, `games/__tests__/revealFixtures.ts` (one entry per `gameComponents` key).

**Produces:** `revealFixtures: Record<string, { mount(): VueWrapper; mineUserId: string; judging(w: VueWrapper): boolean }>` — `judging` answers „is anything that judges my tip visible?“ in the game's own terms (DOM: `[data-judging]` with `opacity-100`; Blockierung: scene `marks` non-empty; story games: their post-story content only).

- [ ] Test: every key of `gameComponents` has a fixture.
- [ ] Test per fixture, stepping fake time in 50 ms to 10 s, `animate: true`, foreground, motion allowed:
  - `judging` ⇒ my row (`row-<mine>`) shown;
  - my row first shown in the same step as `playVerdict` (or never `playVerdict` for Entstauber, Weltanschauung);
  - no foreign row shown before my row + `VERDICT_MS`.
- [ ] Games still showing judgement early run under `it.fails` with a list named `NOT_YET_ON_THE_VERDICT`; each later task removes its entry.
- [ ] Commit: „Check every reveal judges with its verdict“.

### Task 5: Farbausmalung

**Files:** `games/guesshue/GuessHueGame.vue`, `GuessHueReveal.vue`, `HueWheelReveal.vue`, `reveal.ts` + specs.

- [ ] Sector + „Lösung“ chip on `verdict` (marked `data-judging`); foreign markers fade and knock on `others` + `othersDelayMs(tick, TIP_COLUMN, n)`; `revealDelayMs` leaves `GuessHueGame`; band grows from `others`.
- [ ] Remove `guess-hue` from `NOT_YET_ON_THE_VERDICT`; commit.

### Task 6: Platzierung, Peilung, Anmaßung

**Files:** `placepatch/PlacePatchReveal.vue`, `echolocate/EchoLocateReveal.vue`, `paintratio/PaintRatioReveal.vue` + specs.

- [ ] Solution / map / picture on `verdict` (`data-judging`); Platzierung's foreign outlines and Peilung's foreign pins on `others` (per tick where they have one).
- [ ] Remove the three from the list; commit.

### Task 7: Blockierung, Anspielung

**Files:** `copyblocks/CopyBlocksReveal.vue`, `songsnippet/SongSnippetReveal.vue`, `songsnippet/StageBar.vue` + specs.

- [ ] Blockierung: marks + spin on `verdict` (0.9 s again).
- [ ] Anspielung: title and cover covered until `verdict` (if the cover costs more than a class toggle, stop and report); `StageBar` morph keeps its relative timing from `story`.
- [ ] Remove both from the list; commit.

### Task 8: Musterung as a story

**Files:** `findpattern/FindPatternReveal.vue`, `PatternGrid.vue`, `preview.ts` + specs.

- [ ] `hold()`; possibilities from `story`; restore the board; `release()` once restored; foreign outlines on `others`.
- [ ] Remove from the list (list now empty → delete it); commit.

### Task 9: Clean-up and guidelines

- [ ] Delete what has no caller left: `RESULTS_DELAY_MS`, `cellDelayMs`, `headCellDelayMs`, `isStill`, `useRevealArming` (if only the timeline uses its logic, fold it in).
- [ ] `frontend-state.md`: replace „A game's reveal is shared“ / verdict / cascade bullets with the timeline rule; `game-lab.md` unchanged unless the lab hold moved.
- [ ] Full suite, lint, types; hand test in the lab per game (browser pane: rows, marks, outlines timing via a DOM probe); commit.
