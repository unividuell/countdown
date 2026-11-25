# Streak-Pop Implementation Plan

> **Superseded in the build:** the pop grew into `MemberPop` (whole roster column, on any change of my standing); see the spec.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When my own streak flares while my avatar is out of view, show the streak icon ×2 at a random spot in the viewport.

**Architecture:** A pure module decides visibility and the spot; a small component teleports a fixed, scaled `StreakMark` and steps its value old → new so the existing watcher flares it; `MemberRow` triggers it where it rings the triangle.

**Tech Stack:** Vue 3, TypeScript, Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-25-streak-pop-design.md`

## Global Constraints

- `StreakMark.vue` stays unchanged.
- Icon ×2; anchor is the icon's foot (`markBox`: foot at x 38.8, y 9.2 in the 48px box).
- Desktop spread past the column: 96 px. Fade-in ~100 ms, total ~1.2 s.
- `z-30`, `pointer-events: none`, `aria-hidden`.

## Review Focus

- Row scrolled sideways, avatar vertically in view: counts as not visible → pop.
- Viewport narrower than column + spread: the spot stays inside the viewport.
- Unmount mid-pop: no timer fires afterwards.
- Reduced motion / background: no pop (already guarded before `playTriangle`).
- A streak rising from below 3 (no old icon): pop shows the new icon fading in.

---

### Task 1: `popPlacement.ts` — visibility and spot

**Files:** Create `webapp-vue/src/members/popPlacement.ts`, test `webapp-vue/src/members/__tests__/popPlacement.spec.ts`

**Interfaces — Produces:**
- `type Box = { left: number; top: number; right: number; bottom: number }`
- `inView(circle: Box, row: Box, viewport: { width: number; height: number }): boolean` — circle fully inside the viewport and, horizontally, inside the row.
- `popSpot(column: { left: number; right: number }, viewport: { width: number; height: number }, rng?: () => number): { x: number; y: number }` — foot point; x in column ± 96 clamped so the ×2 icon (52 wide, 52 tall above the foot) stays ≥ 16 px from every edge.
- `POP_SCALE = 2`

Tests: inside → true; above viewport → false; scrolled out of row sideways → false; `rng` 0 and ~1 hit the clamped bounds on a 375 px and a 1280 px viewport.

### Task 2: `StreakPop.vue`

**Files:** Create `webapp-vue/src/members/StreakPop.vue`, test `webapp-vue/src/members/__tests__/StreakPop.spec.ts`

**Interfaces — Consumes:** `POP_SCALE`, `FLARE_MS`, `markBox`. **Produces:** props `{ from: number; to: number; x: number; y: number }`, emits `done`; `POP_MS` exported.

Tests: mounts with `from`, shows `to` after a tick (flare `animate` called); emits `done` after `POP_MS`; no `done` after unmount.

### Task 3: Hook into `MemberRow.vue`

**Files:** Modify `webapp-vue/src/members/MemberRow.vue`, test `MemberRow.spec.ts` (streak block)

At the flare timer for `meId`: if `!inView(...)`, set `pop` to `{ from, to, ...popSpot(rowRect) }`; template `<Teleport to="body"><StreakPop v-if="pop" … @done="pop = null" /></Teleport>`.

Tests: own avatar in view → no pop; out of view → pop with the new band; another member's rise → no pop.

### Task 4: Verify in the browser, commit
