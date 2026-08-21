# Mobile Round Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone the round's card becomes a white band that spans the viewport, from `sm` it is
today's bordered card again — and the frame moves out of the games into the two hosts that mount
them, so a game writes only its board.

**Architecture:** One prop-less component `ui/RoundSurface.vue` carries the frame; two `@utility`
names in `assets/main.css` carry the two measurements that more than one file has to agree on
(`round-bleed` for the band's geometry, `hue-wheel` for the colour wheel's cap). `RoundCard` and
the lab's game page mount the surface; the four game views lose their own frame. `MessageCard`
becomes a consumer; `CountdownCard` and the two height-reserving placeholders take the measurement
only.

**Tech Stack:** Vue 3 (SFC, `<script setup lang="ts">`), Tailwind v4 (CSS-first, `@utility`),
Vitest + `@vue/test-utils` + happy-dom, pnpm. Everything in `webapp-vue/`; no backend change.

**Spec:** [`docs/superpowers/specs/2026-08-21-mobile-round-surface-design.md`](../specs/2026-08-21-mobile-round-surface-design.md)

## Global Constraints

- **Working directory for every command:** `webapp-vue/`. Commands: `pnpm test` (`vitest run`),
  `pnpm lint` (`eslint .`), `pnpm typecheck` (`vue-tsc -b`).
- **Breakpoint is `sm` = 40rem = 640px.** Tailwind default; `main.css` defines no `--breakpoint-*`
  and there is no `tailwind.config`. This is the **first** use of `sm:` in the project — only `md:`
  in `App.vue` exists today. Never `xl` (that is 80rem; `max-w-xl` is an unrelated max-width name).
- **Mobile-first.** Add upward with breakpoints (`sm:`), never write a desktop layout and patch it
  downward.
- **Language:** source code, identifiers and code comments in **English**. User-facing text stays
  **German**, and German user-facing text uses `„…“` (low opening, high closing) — never a straight
  `"`. Commit messages and PR text in English.
- **Comments:** no redundant inline comments and no tombstones ("was p-6 before"). Rationale that
  explains *why* goes in the commit message and, if transferable, into `.claude/guidelines/`.
- **Tests:** Vitest with `vi` (never mockk). **happy-dom computes no CSS and no box sizes** —
  `getBoundingClientRect()` answers zeroes. Assert structural proxies (a class is present, a class
  is absent, an element is inside another), never a pixel value.
- **Commits:** frequent, one per task, English message, ending with the trailer
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stay on the current feature branch; do
  not open a PR as part of this plan.

### Facts already verified — rely on them, do not re-litigate

1. **A nested `@media` with `theme()` inside an `@utility` body compiles.** Measured with a probe
   through `vite build` on tailwindcss 4.3.3: `@utility probe-bleed { margin-inline: calc(var(--spacing) * -4); @media (width >= theme(--breakpoint-sm)) { margin-inline: 0 } }`
   emitted `.probe-bleed{margin-inline:calc(var(--spacing) * -4)}@media (width>=40rem){.probe-bleed{margin-inline:0}}`.
2. **`calc(var(--spacing) * -4)` is byte-for-byte what Tailwind emits for `-mx-4`.** The same build
   emitted `.-mx-1{margin-inline:calc(var(--spacing) * -1)}`. This is what makes the bleed and
   `main`'s padding *one* measurement rather than two that happen to match.
3. **`width: 100%` and a negative inline margin are mutually exclusive.** Measured in Chromium on a
   343px parent: with `width:100%; margin-inline:-16px` the box reads `{left:-16, right:327, width:343}`
   — the equation is over-constrained, the right margin is dropped, and the box merely *shifts*.
   With width `auto` it reads `{left:-16, right:359, width:375}`. **Every element that carries
   `round-bleed` must therefore not carry `w-full`.**

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `src/ui/RoundSurface.vue` | The frame around a round: band on a phone, card from `sm`. One slot, no props, no logic. |
| `src/ui/__tests__/RoundSurface.spec.ts` | That the surface renders its slot, is findable, and takes its geometry from the utility. |
| `src/games/songsnippet/__tests__/SongSnippetReveal.spec.ts` | The one game view no existing spec mounts unstubbed; needed to hold it to bringing no frame. |

**Modified files**

| File | Change |
|---|---|
| `src/assets/main.css` | Two new `@utility` blocks: `round-bleed`, `hue-wheel`. |
| `src/games/guesshue/HueWheelInput.vue` | Wheel box: `w-full max-w-80` → `hue-wheel`. |
| `src/games/guesshue/HueWheelReveal.vue` | Same. |
| `src/games/guesshue/GuessHueBoard.vue` | Root loses the frame, keeps `group`. |
| `src/games/guesshue/GuessHueReveal.vue` | Root loses the frame, gains `data-test="hue-reveal"`. |
| `src/games/songsnippet/SongSnippetBoard.vue` | Root loses the frame, keeps `flex flex-col gap-4`. |
| `src/games/songsnippet/SongSnippetReveal.vue` | Same, gains `data-test="song-reveal"`. |
| `src/rounds/RoundCard.vue` | One `<RoundSurface>` around all three faces; its two hand-built frames go. |
| `src/pages/c/[slug]/lab/[game].vue` | `<RoundSurface>` around the game component. |
| `src/communities/fallbacks/MessageCard.vue` | Becomes a consumer of the surface; loses `w-full` and `px-6`. |
| `src/communities/fallbacks/CountdownCard.vue` | Takes `round-bleed` + `sm:rounded-xl`; loses `w-full` and the unconditional `rounded-xl`. |
| `src/communities/fallbacks/RoundFallback.vue` | `fallback-placeholder` takes the bleed, loses `w-full`. |
| `src/pages/c/[slug]/index.vue` | `round-placeholder` takes the bleed, loses `w-full`. |
| `src/__tests__/app-header.spec.ts` | Guard: `<main>` still carries `p-4`. |
| `src/games/guesshue/__tests__/HueWheelInput.spec.ts` | The wheel's width comes from `hue-wheel`. |
| `src/games/guesshue/__tests__/HueWheelReveal.spec.ts` | Same. |
| `src/games/guesshue/__tests__/GuessHueBoard.spec.ts` | The board brings no frame. |
| `src/games/guesshue/__tests__/GuessHueGame.spec.ts` | Line 236's `.closest('.rounded-xl')` is rewritten; the reveal brings no frame. |
| `src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts` | The board brings no frame. |
| `src/rounds/__tests__/RoundCard.spec.ts` | Exactly one surface; every face inside it; the notice outside. |
| `src/gamelab/__tests__/lab-page.spec.ts` | The game component sits inside a surface. |
| `src/communities/fallbacks/__tests__/MessageCard.spec.ts` | Is a surface, no `w-full`. |
| `src/communities/fallbacks/__tests__/CountdownCard.spec.ts` | Carries the bleed, no `w-full`. |
| `src/communities/fallbacks/__tests__/RoundFallback.spec.ts` | The placeholder carries the bleed, no `w-full`. |
| `src/pages/c/[slug]/__tests__/index.spec.ts` | Same for the round placeholder. |
| `.claude/guidelines/frontend-ui.md` | Two new transferable rules (Task 7). |

**Commit-boundary rule.** Tasks 1 and 2 leave the rendered page unchanged. Task 3 flips games and
hosts **together** — split either way and a commit would render a frameless game or a doubled
border. Tasks 4–6 each bring one more box of the round slot onto the same geometry; between them
two states of that slot can disagree in width, but they are never on screen together.

---

### Task 1: The bleed measurement and the surface

**Files:**
- Modify: `src/assets/main.css` (append after the `song-cover` utility at the end of the file)
- Create: `src/ui/RoundSurface.vue`
- Create: `src/ui/__tests__/RoundSurface.spec.ts`
- Modify: `src/__tests__/app-header.spec.ts` (add one `it` inside `describe('App main header')`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - CSS utility **`round-bleed`** — `margin-inline: calc(var(--spacing) * -4)`, reset to `0` from
    `sm`. Used by Tasks 5 and 6 as well.
  - Component **`RoundSurface`**, default export of `src/ui/RoundSurface.vue`. No props, no emits,
    one default slot. Root element carries `data-test="round-surface"` and exactly the classes
    `round-bleed border-y border-neutral-200 bg-white p-4 sm:rounded-xl sm:border-x`. Tasks 3 and 4
    import it as `import RoundSurface from '@/ui/RoundSurface.vue'`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/RoundSurface.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundSurface from '@/ui/RoundSurface.vue'

describe('RoundSurface', () => {
  it('renders whatever it is handed', () => {
    const w = mount(RoundSurface, { slots: { default: '<p data-test="content">Brett</p>' } })

    expect(w.get('[data-test="content"]').text()).toBe('Brett')
  })

  it('is findable, so a host can be held to mounting it', () => {
    expect(mount(RoundSurface).attributes('data-test')).toBe('round-surface')
  })

  // happy-dom computes no CSS, so the band cannot be measured here. What a spec can pin is that
  // the geometry comes from the shared utility and not from a literal margin that would drift
  // away from `main`'s padding.
  it('takes its bleed from the shared utility, never from a literal margin', () => {
    const classes = mount(RoundSurface).classes()

    expect(classes).toContain('round-bleed')
    expect(classes.join(' ')).not.toMatch(/(^|\s)-?mx-/)
  })

  // `border-y` always and `border-x` only from sm, rather than `border` plus an override: with two
  // classes competing for one property the result would depend on Tailwind's cascade order.
  it('declares the two edges separately so no two classes compete for one property', () => {
    const classes = mount(RoundSurface).classes()

    expect(classes).toContain('border-y')
    expect(classes).toContain('sm:border-x')
    expect(classes).toContain('sm:rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('rounded-xl')
  })

  it('states the gutter itself, so a game never has to', () => {
    expect(mount(RoundSurface).classes()).toContain('p-4')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm test src/ui/__tests__/RoundSurface.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/RoundSurface.vue"`.

- [ ] **Step 3: Add the `round-bleed` utility**

Append to the end of `src/assets/main.css`:

```css
/* The round slot's full-bleed on a phone: the band spans the viewport by giving back exactly the
   page gutter — `main p-4` in `App.vue` — and from `sm` the card is back inside the content column,
   so the bleed switches off. Spelled by name everywhere the slot's geometry has to agree (the
   surface, the countdown card, the two height-reserving placeholders), because four equal literals
   are three chances to drift.
   `calc(var(--spacing) * -4)` is what Tailwind itself emits for `-mx-4`, so this and `main`'s
   padding are one measurement rather than two that happen to match. An element carrying this must
   NOT also carry `w-full`: with a definite width the margin equation is over-constrained, CSS drops
   the right margin, and the box merely shifts sideways instead of widening. */
@utility round-bleed {
  margin-inline: calc(var(--spacing) * -4);

  @media (width >= theme(--breakpoint-sm)) {
    margin-inline: 0;
  }
}
```

- [ ] **Step 4: Create the surface**

Create `src/ui/RoundSurface.vue`:

```vue
<template>
  <!--
    The surface a round is drawn on: on a phone a white band that spans the viewport, from `sm` the
    bordered card inside the content column. One slot, no props, no state.

    Mounted by whoever puts a game on a page — `rounds/RoundCard.vue` and the lab's game page — and
    never by a game itself. A game that frames itself is a game that can frame itself wrong, and
    two of them crossfading stack two borders for the length of the fade.
  -->
  <div
    data-test="round-surface"
    class="round-bleed border-y border-neutral-200 bg-white p-4 sm:rounded-xl sm:border-x"
  >
    <slot />
  </div>
</template>
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm test src/ui/__tests__/RoundSurface.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Add the page-gutter guard**

In `src/__tests__/app-header.spec.ts`, inside `describe('App main header')`, next to the existing
`clips horizontally at the unpadded root…` test, add:

```ts
  // `RoundSurface`'s `round-bleed` gives back exactly this padding to reach the display edge on a
  // phone. The two are one measurement; if this padding ever moves, the band stops meeting the edge
  // and nothing else in the suite would notice.
  it('keeps the page gutter that the round surface breaks out of', () => {
    const main = mount(App, { global: { stubs } }).get('main')

    expect(main.classes()).toContain('p-4')
  })
```

This one is green on the current code by construction — it is a regression guard for a coupling
that only starts existing now, not a TDD step.

- [ ] **Step 7: Run the touched specs, then lint and typecheck**

Run: `pnpm test src/ui/__tests__/RoundSurface.spec.ts src/__tests__/app-header.spec.ts`
Expected: PASS.

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/assets/main.css src/ui/RoundSurface.vue src/ui/__tests__/RoundSurface.spec.ts src/__tests__/app-header.spec.ts
git commit -m "$(cat <<'MSG'
feat(webapp): a shared surface for the round, full-bleed on a phone

Mobile the round's card becomes a white band that spans the viewport; from `sm`
it is the bordered card inside the content column again. Nothing consumes it yet.

The band's geometry is one named measurement, not a literal: `round-bleed` gives
back `calc(var(--spacing) * -4)`, which is exactly what Tailwind emits for the
`-mx-4` that `main`'s `p-4` costs. A test holds `main` to that padding, because
that is the half of "these two numbers are one" a spec can check.

`border-y` always and `border-x` only from `sm`, rather than `border` plus an
override: with two classes competing for one property the outcome would depend on
Tailwind's cascade order rather than on what the file says.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: One measurement for the colour wheel

**Files:**
- Modify: `src/assets/main.css` (append after `round-bleed`)
- Modify: `src/games/guesshue/HueWheelInput.vue:292`
- Modify: `src/games/guesshue/HueWheelReveal.vue:141`
- Modify: `src/games/guesshue/__tests__/HueWheelInput.spec.ts`
- Modify: `src/games/guesshue/__tests__/HueWheelReveal.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent; may be done before it).
- Produces: CSS utility **`hue-wheel`** — `width: 100%`, `max-width: 27rem`, and `max-width: 20rem`
  from `sm`. Both wheel boxes spell it by name.

**Why this is one utility and not two classes:** the two elements carry a character-for-character
identical class string today, and the reveal lays its markers on the input wheel's own circle
(`KNOB_TRACK_FRACTION` shared through `wheel.ts`, "my marker covers the knob exactly" is built, not
recomputed). Two literals that must be equal are a visible jump the moment one moves.

- [ ] **Step 1: Write the failing tests**

In `src/games/guesshue/__tests__/HueWheelInput.spec.ts`, inside the existing top-level `describe`,
add:

```ts
  // The board and the reveal draw the same circle in the same place, so their width is one
  // measurement with a name rather than two identical literals — see `@utility hue-wheel`.
  it('takes its width from the shared wheel measurement', () => {
    const classes = mountWheel().get('[data-test="hue-wheel"]').classes()

    expect(classes).toContain('hue-wheel')
    expect(classes).not.toContain('max-w-80')
    expect(classes).not.toContain('w-full')
  })
```

In `src/games/guesshue/__tests__/HueWheelReveal.spec.ts`, inside the existing top-level `describe`,
add:

```ts
  // Same measurement as the input wheel, by name: the reveal crossfades onto that circle, so any
  // difference in width shows up as a jump the moment the round resolves.
  it('takes its width from the shared wheel measurement', () => {
    const classes = mountWheel().get('[data-test="hue-wheel-reveal"]').classes()

    expect(classes).toContain('hue-wheel')
    expect(classes).not.toContain('max-w-80')
    expect(classes).not.toContain('w-full')
  })
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test src/games/guesshue/__tests__/HueWheelInput.spec.ts src/games/guesshue/__tests__/HueWheelReveal.spec.ts`
Expected: both new tests FAIL — `expected [ 'relative', 'mx-auto', … ] to include 'hue-wheel'`.

- [ ] **Step 3: Add the `hue-wheel` utility**

Append to `src/assets/main.css`, after `round-bleed`:

```css
/* How wide the colour wheel is — on the wheel that takes input and on the wheel that shows the
   result. One value for both, because the reveal lays its markers on the input wheel's own radius
   and angle ("my marker covers the knob exactly" is built, not recomputed): any difference between
   the two is a jump the moment the round resolves.
   27rem is the widest common phone (430px), so on every real phone the cap never bites and the
   wheel is as wide as the band allows. It exists for what lies above: without it an unfolded
   foldable would draw a 608px wheel, which is a poster rather than a control, and the confirm
   button in its centre would sit below half the page. From sm the card is back and 20rem keeps the
   wheel the size it has always been. */
@utility hue-wheel {
  width: 100%;
  max-width: 27rem;

  @media (width >= theme(--breakpoint-sm)) {
    max-width: 20rem;
  }
}
```

- [ ] **Step 4: Point both wheels at it**

In `src/games/guesshue/HueWheelInput.vue:292`, replace

```
      class="relative mx-auto aspect-square w-full max-w-80 rounded-full select-none"
```

with

```
      class="hue-wheel relative mx-auto aspect-square rounded-full select-none"
```

In `src/games/guesshue/HueWheelReveal.vue:141`, replace

```
      class="relative mx-auto aspect-square w-full max-w-80 rounded-full select-none"
```

with

```
      class="hue-wheel relative mx-auto aspect-square rounded-full select-none"
```

- [ ] **Step 5: Run the two specs and watch them pass**

Run: `pnpm test src/games/guesshue/__tests__/HueWheelInput.spec.ts src/games/guesshue/__tests__/HueWheelReveal.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite, lint and typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS with no errors. (The full suite here because the wheel is mounted from several
specs — `GuessHueBoard`, `GuessHueGame`, `HueWheelInput`, `HueWheelReveal`.)

- [ ] **Step 7: Commit**

```bash
git add src/assets/main.css src/games/guesshue/HueWheelInput.vue src/games/guesshue/HueWheelReveal.vue src/games/guesshue/__tests__/HueWheelInput.spec.ts src/games/guesshue/__tests__/HueWheelReveal.spec.ts
git commit -m "$(cat <<'MSG'
refactor(webapp): the colour wheel's width becomes one named measurement

`max-w-80` stood twice, character for character the same class string, on the
wheel that takes input and on the wheel that shows the result. The reveal lays its
markers on the input wheel's own radius and angle, so the two widths being equal
is a promise — and two literals keeping a promise is one edit away from breaking
it. `@utility hue-wheel` is now the single place, the way `song-cover` already is
for the cover width.

Mobile the cap rises to 27rem, the width of the widest common phone (430px), so on
a real phone it never bites and the wheel takes the whole band. It still exists for
what lies above: unbounded, an unfolded foldable draws a 608px wheel, which is a
poster rather than a control. From sm it is the 20rem it has always been.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: The hosts mount the surface, the games lose their frame

This is one task on purpose: strip the games first and a commit renders frameless games; mount the
hosts first and a commit renders doubled borders.

**Files:**
- Modify: `src/games/guesshue/GuessHueBoard.vue`
- Modify: `src/games/guesshue/GuessHueReveal.vue`
- Modify: `src/games/songsnippet/SongSnippetBoard.vue`
- Modify: `src/games/songsnippet/SongSnippetReveal.vue`
- Modify: `src/rounds/RoundCard.vue`
- Modify: `src/pages/c/[slug]/lab/[game].vue`
- Modify: `src/games/guesshue/__tests__/GuessHueBoard.spec.ts`
- Modify: `src/games/guesshue/__tests__/GuessHueGame.spec.ts` (rewrites the test at line 236)
- Modify: `src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts`
- Create: `src/games/songsnippet/__tests__/SongSnippetReveal.spec.ts`
- Modify: `src/rounds/__tests__/RoundCard.spec.ts`
- Modify: `src/gamelab/__tests__/lab-page.spec.ts`

**Interfaces:**
- Consumes: `RoundSurface` from Task 1 (`import RoundSurface from '@/ui/RoundSurface.vue'`; no
  props, one default slot, root has `data-test="round-surface"`).
- Produces: two new test handles — `data-test="hue-reveal"` on `GuessHueReveal`'s root and
  `data-test="song-reveal"` on `SongSnippetReveal`'s root. Nothing later in this plan depends on
  them; they exist because those two roots are otherwise unreachable from a spec.

- [ ] **Step 1: Write the failing tests — the four game views bring no frame**

In `src/games/guesshue/__tests__/GuessHueBoard.spec.ts`, inside `describe('GuessHueBoard')`, add:

```ts
  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page). A board
  // that frames itself puts a second border inside the surface — and two of them for the length of
  // the reveal crossfade.
  it('brings no frame of its own', () => {
    const classes = mountBoard().classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('keeps the group hook the reveal transition writes its leave class onto', () => {
    expect(mountBoard().classes()).toContain('group')
  })
```

In `src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts`, inside `describe('SongSnippetBoard')`,
add:

```ts
  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page).
  it('brings no frame of its own', () => {
    const classes = mountBoard({}).classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('keeps the column spacing the search box and the bar are placed by', () => {
    const classes = mountBoard({}).classes()

    expect(classes).toContain('flex')
    expect(classes).toContain('flex-col')
    expect(classes).toContain('gap-4')
  })
```

Create `src/games/songsnippet/__tests__/SongSnippetReveal.spec.ts` — the only game view no existing
spec mounts unstubbed (`SongSnippetGame.spec.ts` replaces it with a stub on purpose):

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SongSnippetReveal from '@/games/songsnippet/SongSnippetReveal.vue'
import type { SongSnippetSolution } from '@/games/songsnippet/types'

const SOLUTION: SongSnippetSolution = {
  artist: 'Element of Crime',
  title: 'Delmenhorst',
  coverUrl: null,
  link: 'https://example.invalid/track/1',
}

/**
 * Both children bring their own audio and asset machinery and are tested where they live; this
 * spec is about the reveal's own root and nothing else.
 */
function mountReveal() {
  return mount(SongSnippetReveal, {
    props: { solution: SOLUTION, durations: [0.1, 0.5, 2, 8, 15], rows: [], live: false },
    global: { stubs: { SongPlayerReveal: true, SongSnippetScoreboard: true } },
  })
}

describe('SongSnippetReveal', () => {
  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page).
  it('brings no frame of its own', () => {
    const classes = mountReveal().classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('is reachable from the game adapter that mounts it', () => {
    expect(mountReveal().attributes('data-test')).toBe('song-reveal')
  })
})
```

In `src/games/guesshue/__tests__/GuessHueGame.spec.ts`, **replace** the whole test at line 236
(`keeps the reveal card in the crossfade's shared grid cell`) with:

```ts
  // Reached by its own handle rather than through `.closest('.rounded-xl')`: the reveal carries no
  // frame any more, and the class it used to be found by only exists from sm.
  it("keeps the reveal in the crossfade's shared grid cell", () => {
    const w = mountAdapter({ solution: SOLUTION, entries: [], mineUserId: null, disabled: true })

    expect(w.get('[data-test="hue-reveal"]').classes()).toContain('[grid-area:1/1]')
  })

  it('lets the reveal bring no frame of its own', () => {
    const w = mountAdapter({ solution: SOLUTION, entries: [], mineUserId: null, disabled: true })
    const classes = w.get('[data-test="hue-reveal"]').classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('p-4')
  })
```

- [ ] **Step 2: Write the failing tests — the hosts mount the surface**

In `src/rounds/__tests__/RoundCard.spec.ts`, inside the top-level `describe`, add:

```ts
  it('draws every face on one shared surface', () => {
    const w = mountCard({ round: aRound(), stage: 'playing' })

    expect(w.findAll('[data-test="round-surface"]')).toHaveLength(1)
    expect(w.get('[data-test="stub-guess"]').element.closest('[data-test="round-surface"]')).not.toBeNull()
  })

  it('puts the sealed face on that same surface', () => {
    const w = mountCard({ round: aRound(), stage: 'sealed' })

    expect(w.findAll('[data-test="round-surface"]')).toHaveLength(1)
    expect(w.get('[data-test="round-reveal"]').element.closest('[data-test="round-surface"]')).not.toBeNull()
  })

  it('puts the unrenderable face on that same surface', () => {
    const round = aRound({
      game: { id: 'unknown-game', displayName: 'Rätselraten', requiresReveal: false },
      me: aPlay(),
    })
    const w = mountCard({ round, stage: 'playing' })

    expect(w.findAll('[data-test="round-surface"]')).toHaveLength(1)
    expect(
      w.get('[data-test="round-unrenderable"]').element.closest('[data-test="round-surface"]'),
    ).not.toBeNull()
  })

  // The notice is about the attempt, not about the round on the board: it belongs above the
  // surface, where it does not move the board down inside its own frame.
  it('keeps the notice outside the surface', () => {
    const w = mountCard({ round: aRound(), stage: 'playing', notice: 'Zu spät.' })

    expect(
      w.get('[data-test="round-notice"]').element.closest('[data-test="round-surface"]'),
    ).toBeNull()
  })
```

`aRound` and `aPlay` are the file's own factories (around lines 50–71); `game` needs all three of
`id`, `displayName` and `requiresReveal`, which is why the unrenderable case above spells them out.

In `src/gamelab/__tests__/lab-page.spec.ts`, inside the top-level `describe`, add:

```ts
  // The lab exists so that a game under review looks exactly as it will in a real round. If the
  // page forgot the surface, it would look right in the game and wrong here — which is the one
  // failure mode this page must not have.
  it('mounts the game on the same surface a real round uses', async () => {
    const w = await mountPage()

    expect(
      w.get('[data-test="stub-guess"]').element.closest('[data-test="round-surface"]'),
    ).not.toBeNull()
  })
```

- [ ] **Step 3: Run all of them and watch them fail**

Run:
```
pnpm test src/games/guesshue/__tests__/GuessHueBoard.spec.ts src/games/guesshue/__tests__/GuessHueGame.spec.ts src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts src/games/songsnippet/__tests__/SongSnippetReveal.spec.ts src/rounds/__tests__/RoundCard.spec.ts src/gamelab/__tests__/lab-page.spec.ts
```
Expected: FAIL. The game specs fail on classes still present (`expected [ … 'rounded-xl' … ] not to include 'rounded-xl'`); the reveal specs fail on the missing `data-test`; the host specs fail with `Cannot call get on an empty DOMWrapper` / `toHaveLength(1)` receiving `0`.

- [ ] **Step 4: Strip the four game views**

`src/games/guesshue/GuessHueBoard.vue` — the root element and the comment above it become:

```html
  <!-- `group` exists for one descendant: the centre button reacts to the leave class the reveal
       transition puts on this element (`hue-card-leaving`). The frame around all this belongs to
       whoever mounts the game — see `ui/RoundSurface.vue`. -->
  <div class="group">
```

Also update the file's opening doc comment: its first line reads `One card: the round.` — it is no
longer a card. Make it `One board: the round.` and leave the rest of that comment as it stands.

`src/games/guesshue/GuessHueReveal.vue` — the root element becomes:

```html
  <div data-test="hue-reveal">
```

`src/games/songsnippet/SongSnippetBoard.vue` — the root element becomes:

```html
  <div class="flex flex-col gap-4">
```

`src/games/songsnippet/SongSnippetReveal.vue` — the root element becomes:

```html
  <div data-test="song-reveal" class="flex flex-col gap-4">
```

- [ ] **Step 5: Mount the surface in `RoundCard`**

In `src/rounds/RoundCard.vue`, add to the imports in `<script setup>`:

```ts
import RoundSurface from '@/ui/RoundSurface.vue'
```

Replace the whole `<template>` with:

```vue
<template>
  <div data-test="round-card">
    <!-- Above the surface, not inside it: the notice is about the attempt that just failed, not
         about the round on the board, and inside the frame it would push the board down. -->
    <p v-if="notice" data-test="round-notice" class="mb-4 text-sm text-amber-700">{{ notice }}</p>

    <RoundSurface>
      <!-- Checked ahead of `stage`, not inside a `stage === 'sealed'` branch only: a sealed round
           for a game this build cannot render is just as unrenderable as a playing one — offering
           "Aufdecken" first and admitting the gap only afterwards would be the same lie one step
           later. -->
      <p v-if="component === null" data-test="round-unrenderable" class="text-sm text-neutral-600">
        Für „{{ round?.game?.displayName }}“ gibt es in dieser Version noch keine Ansicht.
      </p>

      <div v-else-if="stage === 'sealed'" class="flex flex-col items-center gap-4 text-center">
        <p class="text-base font-semibold text-neutral-900">{{ round?.game?.displayName }}</p>
        <button
          type="button"
          data-test="round-reveal"
          class="h-11 w-full cursor-pointer rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:cursor-default disabled:opacity-40"
          :disabled="busy"
          @click="onReveal"
        >
          Aufdecken
        </button>
      </div>

      <!--
        Keyed on the round's own number: a 409 on `submit`/`reveal` sends `useRound` back to
        `reload()`, which can land a *different* round in place (the day boundary passed underneath
        the click) without this `RoundCard` ever unmounting. Without the key the component instance
        would survive that change carrying the previous round's local state — a half-turned wheel
        angle, in Guess Hue's case — the same reasoning the lab applies keyed on `round.seed`.
      -->
      <component
        :is="component"
        v-else-if="stage === 'playing' || stage === 'done'"
        :key="round?.round?.number"
        :payload="round?.payload"
        :outcome="round?.me?.outcome ?? null"
        :my-guess="round?.me?.guess ?? null"
        :solution="round?.solution"
        :entries="entries"
        :mine-user-id="round?.me?.userId ?? null"
        :award-rule="round?.awardRule ?? null"
        :disabled="busy || stage === 'done'"
        :stage="round?.me?.stage ?? 0"
        :asset-url="assetUrl"
        @guess="onGuess"
        @skip="props.skip"
        @give-up="props.giveUp"
      />
    </RoundSurface>
  </div>
</template>
```

Note what changed besides the wrapper: the old top-of-template comment ("No chrome at this
level…") is gone because it is now false, the unrenderable paragraph lost
`rounded-xl border border-neutral-200 bg-white p-6`, and the sealed face lost
`rounded-xl border border-neutral-200 bg-white p-6` — the surface provides all of it.

- [ ] **Step 6: Mount the surface on the lab's game page**

In `src/pages/c/[slug]/lab/[game].vue`, add to the imports:

```ts
import RoundSurface from '@/ui/RoundSurface.vue'
```

Wrap the `<component :is="gameComponent">` block. The `v-if` moves onto the surface so an
unanswered round renders nothing rather than an empty band:

```vue
    <RoundSurface v-if="round">
      <!--
        Keyed on `round.seed`, the seed the *response* carries, not the URL's — the two go out of
        step for one tick whenever rolling writes the new seed to the URL before the matching round
        has come back. Keying on the URL seed would remount right then, capturing the previous
        round's data as if it were the new one (the entrance animation starts from the wrong angle
        and never gets a second chance to run); `round.seed` only changes once the new round's data
        is actually here, so the remount and the data land together. The same remount also discards
        any uncommitted scratch state a game component keeps locally (a value typed but never
        submitted) once the round it belonged to is gone.
      -->
      <component
        :is="gameComponent"
        :key="round.seed"
        :payload="round.payload"
        :outcome="round.me?.outcome ?? null"
        :my-guess="round.me?.guess ?? null"
        :solution="round.solution"
        :entries="entries"
        :mine-user-id="round.me?.userId ?? null"
        :award-rule="round.awardRule"
        :disabled="busy || round.me !== null"
        :stage="round.myStage"
        :asset-url="
          (key: number) => labAssetUrl(community.slug, gameId, round?.seed ?? 0, phase, key)
        "
        @guess="guess"
        @skip="skip"
        @give-up="run(giveUpLabRound)"
      />
    </RoundSurface>
```

`round.seed`, `round.payload` and the rest lose their `?.` inside the `v-if="round"` block; keep
`round?.seed ?? 0` inside the `:asset-url` arrow function, because that closure runs outside the
template's narrowing. If `vue-tsc` disagrees with any narrowing here, restore the `?.` rather than
arguing with it — this task is about the frame, not about types.

- [ ] **Step 7: Run the six specs and watch them pass**

Run:
```
pnpm test src/games/guesshue/__tests__/GuessHueBoard.spec.ts src/games/guesshue/__tests__/GuessHueGame.spec.ts src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts src/games/songsnippet/__tests__/SongSnippetReveal.spec.ts src/rounds/__tests__/RoundCard.spec.ts src/gamelab/__tests__/lab-page.spec.ts
```
Expected: PASS.

- [ ] **Step 8: Run the whole suite, lint and typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS with no errors. If another spec fails on a class it used to find a game's frame by,
retarget it at `[data-test="round-surface"]` — do not put the frame back.

- [ ] **Step 9: Commit**

```bash
git add src/games/guesshue src/games/songsnippet src/rounds src/pages/c/\[slug\]/lab src/gamelab
git commit -m "$(cat <<'MSG'
refactor(webapp): the host frames the round, not the game

The same frame chain stood at six places — both Guess Hue views, both Song Snippet
views, and twice more hand-built inside RoundCard. A new game had to know it and
get it right, and during Guess Hue's reveal crossfade two of those frames lay on
top of each other for 300ms.

Now the two places that put a game on a page mount the surface: RoundCard and the
lab's game page. The four game views are bare content, RoundCard is one surface
with three faces instead of two ad-hoc frames plus an unframed game, and the
crossfade happens inside a single border.

The lab is the risk this introduces — it renders game components directly, so a
forgotten wrapper there would make a game look different in the very place built
to preview it. A test on the lab page pins it.

The reveal views gain a data-test handle: their roots are otherwise unreachable
from a spec, and the class the Guess Hue test used to find them by
(`.closest('.rounded-xl')`) is gone — and would only have existed from sm anyway.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `MessageCard` becomes a consumer

**Files:**
- Modify: `src/communities/fallbacks/MessageCard.vue`
- Modify: `src/communities/fallbacks/__tests__/MessageCard.spec.ts`

**Interfaces:**
- Consumes: `RoundSurface` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/communities/fallbacks/__tests__/MessageCard.spec.ts`, inside `describe('MessageCard')`, add:

```ts
  it('is drawn on the shared surface rather than a frame of its own', () => {
    const w = mount(MessageCard, { props: { title: 'x' } })

    expect(w.attributes('data-test')).toBe('round-surface')
    expect(w.classes()).not.toContain('rounded-xl')
  })

  // `width: 100%` and the surface's negative inline margin are mutually exclusive: with a definite
  // width the margin equation is over-constrained, CSS drops the right margin, and the box keeps
  // its 343px and merely shifts 16px left instead of spanning 375px. Measured in Chromium.
  // happy-dom computes no layout, so the class's absence is the only thing a spec can hold.
  it('leaves its width to the bleed, so the square is the band and not a shifted box', () => {
    expect(mount(MessageCard, { props: { title: 'x' } }).classes()).not.toContain('w-full')
  })
```

The file's existing `stays square, so the page keeps its silhouette across states` test asserts
`aspect-square` on the root and must keep passing unchanged — the class moves onto the surface, and
`w.classes()` reads the same root element either way.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/communities/fallbacks/__tests__/MessageCard.spec.ts`
Expected: FAIL — `expected undefined to be 'round-surface'`, and the `w-full` assertion fails too.

- [ ] **Step 3: Rewrite the component**

`src/communities/fallbacks/MessageCard.vue` in full:

```vue
<script setup lang="ts">
import RoundSurface from '@/ui/RoundSurface.vue'

defineProps<{ title: string; text?: string }>()
</script>

<template>
  <!-- No `w-full`: the surface's bleed can only widen a box whose width is `auto` — with a definite
       width the margin equation is over-constrained and the box shifts sideways instead. The square
       is therefore the band's own, which is what keeps this state, the countdown and the
       placeholder at one edge length. -->
  <RoundSurface class="flex aspect-square flex-col items-center justify-center text-center">
    <p class="text-base font-semibold text-neutral-900">{{ title }}</p>
    <p v-if="text" class="mt-2 text-sm leading-relaxed text-neutral-600">{{ text }}</p>
  </RoundSurface>
</template>
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test src/communities/fallbacks/__tests__/MessageCard.spec.ts`
Expected: PASS, all six tests including the two pre-existing ones.

- [ ] **Step 5: Run the fallback specs, lint and typecheck**

Run: `pnpm test src/communities/fallbacks && pnpm lint && pnpm typecheck`
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/communities/fallbacks/MessageCard.vue src/communities/fallbacks/__tests__/MessageCard.spec.ts
git commit -m "$(cat <<'MSG'
refactor(webapp): the message fallback is drawn on the shared surface

It sits in the same slot as the round, so it has to be the same shape — otherwise
the page changes silhouette between "no game today" and a game. It loses its own
frame and its `px-6`, taking the surface's 16px instead; an early view adapting to
the geometry the two games drive, rather than the geometry bending for it.

It also loses `w-full`, which is load-bearing: with a definite width the bleed's
negative margin is over-constrained, so CSS drops the right margin and the box
merely shifts 16px left instead of widening to the display edge. happy-dom
computes no layout, so only the class's absence is testable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: `CountdownCard` takes the measurement, not the component

**Files:**
- Modify: `src/communities/fallbacks/CountdownCard.vue`
- Modify: `src/communities/fallbacks/__tests__/CountdownCard.spec.ts`

**Interfaces:**
- Consumes: the `round-bleed` utility from Task 1. Deliberately **not** `RoundSurface`.
- Produces: nothing new.

**Why not the component:** its `w-[72%]` hero and `w-[94%]` time strip have to be percentages of
the *whole* surface, which is why it carries `py-4` and no horizontal padding. Inside the surface's
`p-4`, 94% of the interior would be 103% of the band — not expressible — and the hero would stay at
247px instead of growing to 270px. Giving `RoundSurface` a `flush` prop for this one caller would
let an early view shape an API the two games drive.

- [ ] **Step 1: Write the failing tests**

In `src/communities/fallbacks/__tests__/CountdownCard.spec.ts`, inside `describe('CountdownCard')`,
add:

```ts
  // Same slot as the round and the message fallback, so the same edge length — but taking the
  // measurement rather than `RoundSurface`, because its two flip-dot boards are percentages of the
  // whole surface and a padded interior cannot express 94% of the band.
  it('spans the display on a phone by the shared bleed', () => {
    const classes = mountCard('42').classes()

    expect(classes).toContain('round-bleed')
    expect(classes).toContain('aspect-square')
  })

  // See MessageCard for the measurement: `width: 100%` plus a negative inline margin is
  // over-constrained, so the box would shift instead of widen.
  it('leaves its width to the bleed', () => {
    expect(mountCard('42').classes()).not.toContain('w-full')
  })

  it('keeps its corners only from sm, where it is a card again', () => {
    const classes = mountCard('42').classes()

    expect(classes).toContain('sm:rounded-xl')
    expect(classes).not.toContain('rounded-xl')
  })

  it('keeps the vertical padding its boards are placed by, and no horizontal padding', () => {
    const classes = mountCard('42').classes()

    expect(classes).toContain('py-4')
    expect(classes.join(' ')).not.toMatch(/(^|\s)(p|px)-\d/)
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test src/communities/fallbacks/__tests__/CountdownCard.spec.ts`
Expected: FAIL — `expected [ 'flex', 'aspect-square', 'w-full', … ] to include 'round-bleed'`.

- [ ] **Step 3: Change the root element**

In `src/communities/fallbacks/CountdownCard.vue`, replace the root element's class attribute.
From:

```html
    class="flex aspect-square w-full flex-col items-center justify-between rounded-xl bg-stone-900 py-4"
```

to:

```html
    class="round-bleed flex aspect-square flex-col items-center justify-between bg-stone-900 py-4 sm:rounded-xl"
```

Nothing else in the file changes. The existing comment above the inner block — the one explaining
that a widthless `<svg viewBox>` contributes 300px, so the wrapper needs `w-full` — stays exactly
as it is: it is about a *descendant* inside a flex column, not about this root, and that `w-full`
must not be removed.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test src/communities/fallbacks/__tests__/CountdownCard.spec.ts`
Expected: PASS, the whole file.

- [ ] **Step 5: Run the fallback specs, lint and typecheck**

Run: `pnpm test src/communities/fallbacks && pnpm lint && pnpm typecheck`
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/communities/fallbacks/CountdownCard.vue src/communities/fallbacks/__tests__/CountdownCard.spec.ts
git commit -m "$(cat <<'MSG'
feat(webapp): the countdown card spans the display on a phone

It shares the round's slot, so it has to share the round's edge length. It takes
the bleed measurement rather than `RoundSurface`: its hero and its time strip are
percentages of the whole surface — which is why it has `py-4` and no horizontal
padding — and inside the surface's `p-4` the strip's 94% would be 103% of the band.
Giving the surface a `flush` prop for this one caller would have let an early view
shape an API the two games drive.

As it stands the two flip-dot boards gain the width for free: the hero goes from
247px to 270px, the strip from 322 to 352. `w-full` has to go for the same reason
as in the message fallback — a definite width makes the negative margin
over-constrained and the box shifts rather than widens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: The two placeholders stop the page from jumping

**Files:**
- Modify: `src/pages/c/[slug]/index.vue` (the `round-placeholder` div)
- Modify: `src/communities/fallbacks/RoundFallback.vue` (the `fallback-placeholder` div)
- Modify: `src/pages/c/[slug]/__tests__/index.spec.ts`
- Modify: `src/communities/fallbacks/__tests__/RoundFallback.spec.ts`

**Interfaces:**
- Consumes: the `round-bleed` utility from Task 1.
- Produces: nothing.

**Why:** both are `aspect-square`, so their height *is* their width. With the real boxes now 375px
wide and the placeholders still 343, the page drops 32px the moment the response lands — which is
exactly the jump these placeholders exist to prevent.

- [ ] **Step 1: Write the failing tests**

In `src/pages/c/[slug]/__tests__/index.spec.ts`, inside `describe('community home')`, after the
existing `does not flip between the card and the fallback while the round is loading` test, add
(same three-line setup that test uses — `mockUseRound({ loading: true })`, a resolved roster, then
`mountPage()`):

```ts
  // The placeholder reserves the round's height, and `aspect-square` makes that height its width.
  // Without the bleed it reserves 343px where the card will be 375, so the page drops 32px the
  // moment the response lands — the very jump this element exists to prevent.
  it('reserves the width the round will actually have', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ loading: true }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    const placeholder = w.get('[data-test="round-placeholder"]')

    expect(placeholder.classes()).toContain('round-bleed')
    expect(placeholder.classes()).toContain('aspect-square')
    expect(placeholder.classes()).not.toContain('w-full')
  })
```

In `src/communities/fallbacks/__tests__/RoundFallback.spec.ts`, inside `describe('RoundFallback')`,
after the existing `reserves the space while the countdown is still in flight` test, add (the same
never-resolving `getCountdown` that holds the fallback at its placeholder):

```ts
  // Same reasoning as the round placeholder on the community page: this square's height is its
  // width, so a placeholder that does not bleed reserves 32px too little for the countdown card
  // that replaces it.
  it('reserves the width the countdown will actually have', () => {
    vi.spyOn(api, 'getCountdown').mockReturnValue(new Promise(() => {}))
    const w = mountFallback('2026-08-11T09:00:00Z')
    const placeholder = w.get('[data-test="fallback-placeholder"]')

    expect(placeholder.classes()).toContain('round-bleed')
    expect(placeholder.classes()).toContain('aspect-square')
    expect(placeholder.classes()).not.toContain('w-full')
  })
```

- [ ] **Step 2: Run both and watch them fail**

Run: `pnpm test src/pages/c/\[slug\]/__tests__/index.spec.ts src/communities/fallbacks/__tests__/RoundFallback.spec.ts`
Expected: FAIL — `expected [ 'mt-6', 'aspect-square', 'w-full' ] to include 'round-bleed'`.

- [ ] **Step 3: Give both placeholders the bleed**

In `src/pages/c/[slug]/index.vue`, the round placeholder. From:

```html
  <div
    v-if="roundState === 'loading'"
    data-test="round-placeholder"
    class="mt-6 aspect-square w-full"
    aria-hidden="true"
  />
```

to:

```html
  <!-- Same width as the card that will replace it: `aspect-square` makes the reserved height the
       reserved width, so a placeholder that does not bleed reserves 32px too little and the page
       drops when the response lands. No `w-full` — a definite width would shift the box instead of
       widening it. -->
  <div
    v-if="roundState === 'loading'"
    data-test="round-placeholder"
    class="round-bleed mt-6 aspect-square"
    aria-hidden="true"
  />
```

In `src/communities/fallbacks/RoundFallback.vue`, the last branch. From:

```html
  <div v-else data-test="fallback-placeholder" class="aspect-square w-full" aria-hidden="true" />
```

to:

```html
  <div v-else data-test="fallback-placeholder" class="round-bleed aspect-square" aria-hidden="true" />
```

- [ ] **Step 4: Run both and watch them pass**

Run: `pnpm test src/pages/c/\[slug\]/__tests__/index.spec.ts src/communities/fallbacks/__tests__/RoundFallback.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite, lint and typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS with no errors. This is the last code task, so the whole suite must be green here.

- [ ] **Step 6: Commit**

```bash
git add src/pages/c/\[slug\]/index.vue src/communities/fallbacks/RoundFallback.vue src/pages/c/\[slug\]/__tests__/index.spec.ts src/communities/fallbacks/__tests__/RoundFallback.spec.ts
git commit -m "$(cat <<'MSG'
fix(webapp): the round placeholders reserve the width the round now has

Both placeholders are `aspect-square`, so the height they reserve is their width.
With the card and the countdown now spanning the display, a placeholder that does
not bleed reserves 343px where 375 is coming — and the page drops 32px the moment
the response lands, which is the one thing these elements exist to prevent.

`w-full` goes for the same reason as everywhere else in this branch: with a
definite width the negative margin is over-constrained and the box shifts sideways
rather than widening.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Measure it in a browser, then feed the knowledge back

Nothing above proves a single pixel: happy-dom computes no CSS. This task is where the design is
actually confirmed, and where the two transferable rules go into the guidelines.

**Files:**
- Modify: `.claude/guidelines/frontend-ui.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing.

- [ ] **Step 1: Bring the app up**

Start the backend and the dev server, and sign in so a community page with a round is reachable:

```bash
cd core && ./mvnw spring-boot:run
```

```bash
cd webapp-vue && pnpm dev
```

Open a community page that has a round (or the lab's game page, which needs no round of the day:
`/c/<slug>/lab/guess-hue?seed=1`). If no signed-in session against a local backend can be had,
**say so and stop** — do not report the design as verified from the unit tests.

- [ ] **Step 2: Measure at 375px**

Set the viewport to 375 × 812 and run this in the console. It reads the numbers the spec claims
rather than eyeballing them:

```js
const surface = document.querySelector('[data-test="round-surface"]')
const wheel = document.querySelector('[data-test="hue-wheel"]')
const out = {
  viewport: window.innerWidth,
  band: surface.getBoundingClientRect(),
  wheel: wheel && wheel.getBoundingClientRect(),
  bodyScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}
JSON.stringify({
  bandWidth: out.band.width,
  bandLeft: out.band.left,
  wheelWidth: out.wheel && out.wheel.width,
  sideways: out.bodyScrollsSideways,
}, null, 2)
```

Expected: `bandWidth: 375`, `bandLeft: 0`, `wheelWidth: 343`, `sideways: false`.

A `bandLeft` of `-16` with `bandWidth: 343` is the over-constraint from Fact 3 — some element in the
chain still has a definite width. A `sideways: true` means the bleed escaped a container that does
not clip; check `App.vue`'s `overflow-x-clip` root is still above it.

- [ ] **Step 3: Check the knob at the horizontal extreme**

Drag the wheel until the knob sits at the left extreme (hue 270), then:

```js
const knob = document.querySelector('[data-test="hue-wheel"] [class*="ring-2"]')
JSON.stringify(knob.getBoundingClientRect())
```

Expected: `left` around 19–20 (the 16px gutter plus 1% of the 343px wheel). It must not be near 0
and must not be negative.

- [ ] **Step 4: Measure at 640px**

Resize to 640 × 900 and re-run the Step 2 snippet.

Expected: `bandWidth: 576`, `wheelWidth: 320`, and the band now has a visible border and rounded
corners on all four sides. Also check 639px: the band should still be full-bleed there — that is
the breakpoint boundary and off-by-one is the classic mistake.

- [ ] **Step 5: Check the slot's four boxes agree**

At 375px, compare the round card, the countdown card (a community without a round of the day, or
before the start date), and the loading placeholders. All must report `width: 375` and, for the
square ones, `height: 375`. A screenshot of each at 375px is the evidence to hand over.

- [ ] **Step 6: Write the two rules into the guidelines**

In `.claude/guidelines/frontend-ui.md`, under `### Sizing that doesn't do what it looks like`, add
two bullets:

```markdown
- **`w-full` and a negative inline margin are mutually exclusive.** A full-bleed band that breaks
  out of the page gutter (`-mx-4` against `main`'s `p-4`) only widens if its width is `auto`: with
  a definite width the margin equation is over-constrained, CSS drops the *right* margin, and the
  box keeps its old width and merely **shifts** sideways. Measured in Chromium on a 343px parent:
  `width:100%; margin-inline:-16px` reads `{left:-16, right:327, width:343}`, width `auto` reads
  `{left:-16, right:359, width:375}`. So every `aspect-square w-full` box that gains a bleed has to
  lose the `w-full` — and because the square's height is its width, forgetting it silently reserves
  32px too little and the page drops when the content lands. happy-dom computes no layout, so the
  only testable proxy is that the class is absent. See `round-bleed`, `MessageCard`,
  `CountdownCard`.
- **A bleed and the gutter it gives back are one measurement.** Where a band spans the viewport by
  cancelling an ancestor's padding, the two numbers must agree or the band stops meeting the display
  edge — and nothing fails. Derive the bleed from the same variable Tailwind computes the padding
  from (`margin-inline: calc(var(--spacing) * -4)` is byte-for-byte what `-mx-4` emits), name it once
  as an `@utility`, and pin the ancestor's padding in a test — that assertion is the only mechanical
  guard there is. See `@utility round-bleed` and the `<main>` guard in `app-header.spec.ts`.
```

Extend the existing bullet that begins **Two screens that must not jump share one measurement** with
the second worked example, so the wheel joins the cover:

```markdown
  The colour wheel is the same story with a sharper edge: `max-w-80` stood identically on
  `HueWheelInput` and `HueWheelReveal`, and the reveal lays its markers on the input wheel's own
  radius — so `@utility hue-wheel` is the one place, and both templates spell it by name.
```

- [ ] **Step 7: Commit the guidelines**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/cool-heisenberg-0bc007
git add .claude/guidelines/frontend-ui.md
git commit -m "$(cat <<'MSG'
docs(guidelines): full-bleed sizing traps from the mobile round surface

Two rules that cost real debugging on this branch and that no unit test can catch,
because happy-dom computes no layout:

`w-full` and a negative inline margin cannot both apply — the margin equation is
over-constrained, CSS drops the right margin, and the box shifts instead of
widening. On an `aspect-square` box that also means it silently reserves too little
height and the page drops when the content lands.

And a bleed plus the gutter it gives back are one measurement, not two that happen
to match: derive the bleed from the same variable Tailwind computes the padding
from, name it once, and pin the ancestor's padding in a test — that assertion is
the only mechanical guard.

The colour wheel also joins the "two screens must not jump" bullet as its second
worked example, beside the song cover.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 8: Report**

State plainly which measurements were taken and what they read, and attach the 375px screenshots.
If any step could not be run (no local backend session, for instance), say which one and why —
never report the layout as verified from the unit suite alone.

---

## Self-Review

**Spec coverage** — every section of the spec maps to a task:

| Spec section | Task |
|---|---|
| Mobil eine Bahn, ab `sm` eine Karte | 1 (surface), 3 (consumers) |
| Bruchpunkt `sm` | 1, 2 (both utilities' media queries) |
| Ein Rand, 16 px — keine zweite Zone | 1 (`p-4` on the surface, no bleed slot anywhere) |
| Rad-Deckel wird ein Maß mit Namen | 2 |
| Die Wirte montieren die Bühne | 3 |
| Frühe Views passen sich an | 4 (`MessageCard`), 5 (`CountdownCard`) |
| `@utility round-bleed` | 1 |
| `@utility hue-wheel` | 2 |
| `ui/RoundSurface.vue` | 1 |
| Umbau-Tabelle, alle 12 Zeilen | 2 (2 rows), 3 (6 rows), 4, 5, 6 (2 rows) |
| Falle: `w-full` + negativer Margin | 4, 5, 6 (tests), 7 (guidelines) |
| Falle: Platzhalter müssen mitwachsen | 6 |
| Falle: der Test an `.rounded-xl` | 3 |
| Tests (alle sieben Punkte) | 1, 2, 3, 4, 5, 6 |
| Browser-Messung | 7 |
| 608–640px Delle | Not implemented on purpose — the spec declares it accepted; Step 4 of Task 7 checks 639px is still full-bleed, which is the part that would be a bug. |

**Placeholder scan** — clean. Every code step carries literal code, resolved against the real
helpers: `mountBoard()` / `mountBoard({})` / `mountAdapter()` / `mountCard()` / `mountPage()` /
`mountFallback()` / `mountWheel()` are each the helper that already exists in the file being edited,
and `aRound`'s `game` is spelled with all three of `id`, `displayName`, `requiresReveal`.

**Type consistency** — `RoundSurface` is prop-less in Task 1 and imported prop-less in Tasks 3 and
4. `data-test` values used across tasks: `round-surface` (defined Task 1, used 3, 4), `hue-reveal`
and `song-reveal` (defined and used within Task 3), `hue-wheel` and `hue-wheel-reveal` (pre-existing,
read in Task 2 and Task 7). Utility names: `round-bleed` (Task 1, used 5, 6), `hue-wheel` (Task 2).
The class string on the surface is quoted identically in Task 1's test, Task 1's component, and the
spec.
