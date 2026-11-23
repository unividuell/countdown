# Verdict im Takt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Nothing in the reveal's table or the roster before the verdict; the verdict starts the row cascade.

**Architecture:** The verdict moves to `RESULTS_DELAY_MS`. `RevealScoreboard` gains a held mode a game releases at runtime (Verrohrung). An animating table announces its rows through `ui/resultsLanding.ts`; the roster (and the lab) apply a pre-fetched answer on that announcement, `SPOILER_HOLD_MS` as ceiling.

**Tech Stack:** Vue 3, Vitest + happy-dom, fake timers.

**Spec:** `docs/superpowers/specs/2026-11-23-verdict-takt-design.md`

## Global Constraints

- English code/comments/commits; guidelines in `.claude/guidelines/frontend-state.md` updated.
- No second timetable: delays come from `revealChoreography.ts`.

## Review Focus

- A name tapped during Verrohrung's first run: the held table must still release (no verdict).
- No tip of mine / muted / background tab in Verrohrung: rows still land.
- History cards (`animate: false`) mounting during a hold must not release the roster.
- Two guesses in a row: the second hold replaces the first; unmount cancels.
- Roster fetch slower than the announcement: apply on arrival.

---

### Task 1: Verdict at `RESULTS_DELAY_MS`

**Files:** `webapp-vue/src/games/useRevealVerdict.ts`; specs of FindPattern, PaintRatio, SongSnippet, CopyBlocks, EchoLocate, GuessHue, PlacePatch reveals.

- [ ] Change the verdict specs to expect the verdict at `RESULTS_DELAY_MS` (silent at `- 1`); run, see them fail.
- [ ] `useRevealVerdict`: `RESULTS_DELAY_MS` instead of `SOLUTION_DELAY_MS`; run, pass; commit.

### Task 2: Announcement + held table

**Files:** create `webapp-vue/src/ui/resultsLanding.ts` (+ spec); modify `games/RevealScoreboard.vue` (+ spec).

**Produces:**
- `announceResults(): void`
- `afterResultsLand(apply: () => void): () => void` — `apply` once, on the next announcement or after `SPOILER_HOLD_MS`, whichever first; returns cancel. `SPOILER_HOLD_MS` moves here.
- `RevealScoreboard` prop `resultsHeld?: boolean` — while true, body rows stay hidden; when it falls, rows cascade from that moment (`cellDelayMs(..., 0)`).
- `RevealScoreboard` announces once its rows start landing, only when `animate`: at `resultsDelayMs` after arming, at release when held, at once when still.

- [ ] Specs: apply-on-announce, apply-on-ceiling, apply-once, cancel; scoreboard announces at `RESULTS_DELAY_MS`, not with `animate: false`, held → hidden until release, then announces.
- [ ] Implement; run; commit.

### Task 3: Verrohrung holds its table until the verdict

**Files:** `games/turnpipes/TurnPipesReveal.vue`, `TurnPipesScoreboard.vue`, spec.

- [ ] Specs: rows hidden while the first run's water and end sound play; released with the verdict; released without verdict for `won: null`; released at once when a name is tapped mid-run; not held on `animate: false`.
- [ ] Implement `held` ref (true iff animating), cleared where the verdict plays or would have; pass to `resultsHeld`; commit.

### Task 4: Roster and lab wait for the announcement

**Files:** `members/useRoster.ts` (+ spec), `pages/c/[slug]/lab/[game]/index.vue`, `pages/c/[slug]/__tests__/index.spec.ts`, `gamelab/__tests__/lab-page.spec.ts`.

- [ ] Specs: `refreshAfterGuess` fetches at once, shows nothing until `announceResults()`; ceiling still applies; slow fetch applies on arrival.
- [ ] Implement with `afterResultsLand`; lab watcher the same; `SPOILER_HOLD_MS` raised to Verrohrung's longest reveal; commit.

### Task 5: Guidelines, full suite

- [ ] `frontend-state.md`: verdict starts the cascade; roster waits for the announcement.
- [ ] `pnpm test`, `pnpm lint`, `pnpm exec vue-tsc -b`; commit.
