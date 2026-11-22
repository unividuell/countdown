# Rundenrampe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A poster stands in front of every round still playable; one tap lets it run out, shows the game loaded underneath and wakes the sound.

**Architecture:** `RoundRamp` wraps the round's surface in one grid cell: the card below (mounted, invisible, `inert`), a poster above. The poster is picked from the round number alone. The ramp provides a "curtain open" signal to its card; the four places that perform on load wait for it. `RoundCard` and the lab page each decide whether a ramp stands and feed it props.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript strict, Tailwind v4, VueUse, Vitest + @vue/test-utils + happy-dom, pnpm. Frontend only.

**Spec:** `docs/superpowers/specs/2026-11-22-rundenrampe-design.md`. Read it first; this plan argues from it.

**Reference:** the spike, commit `b902b289` on branch `feature/game-rampe-intro-scene-53ca6b`, files under `webapp-vue/src/spike/ramp/`. Read a file with `git show b902b289:webapp-vue/src/spike/ramp/<file>`. Its look, measures and timings were approved on a phone and in the iOS simulator: port them verbatim unless a task says otherwise.

## Global Constraints

- All commands run in `webapp-vue/`. After every task: `pnpm test`, `pnpm exec vue-tsc -b`, `pnpm lint` — and read the lint output: Prettier warnings exit 0 and still count.
- Code, comments and commit messages in English. User-facing German uses `„…“`, never a straight `"`.
- Comments say what a block does and why, briefly. No comment that only narrates a change. Do not touch code unrelated to the task.
- Commit messages follow the seven rules in `CLAUDE.md` (imperative subject ≤ 50 chars, body wrapped at 72, what and why). End each with this fixed project line, copied character for character (it is not a statement about which model wrote the commit): `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git commit --amend`: always a new commit.
- No push, no PR without the user's word.
- Exact copy: „Aktuelle Runde“; `№ −98` (true minus U+2212, never a hyphen); „12 Punkte zum Abstauben“, „1 Punkt zum Abstauben“; lab switch label „Rampe“.
- Colours: ground `var(--color-phase-one)` / `var(--color-phase-two)`, ink `var(--color-on-phase-one)` / `var(--color-on-phase-two)`. Nothing else.
- Letters stay in the system face (`font-weight: 900`, `letter-spacing: -0.04em`). Only `@fontsource-variable/fraunces` is added, for the sheet's digits. No font is fetched from a third party.
- Two styles only: band and calendar sheet. The spike's plain "Laufband" (`band: false`) and `GooFlood` are not ported.
- Nothing under `src/spike/` and no `pages/spike/` reaches this branch.
- Animation guards: nothing animates under `prefers-reduced-motion`, in a background tab, or without `Element.animate` (`ui/motion.ts`). The resting state is correct without the animation.
- No secure-context-only API (`crypto.subtle`, clipboard): phones test over LAN HTTP.

## Review Focus

1. **The scene goes away while the ramp is up** (lab: "forget mine" from the drawer; a round that turns unplayable): the ramp goes at once, the card is usable. Test in Task 4.
2. **A second tap during the run-out:** opens once, wakes once, throws nothing. Test in Task 3.
3. **Nothing may animate** (reduced motion, hidden tab, no `Element.animate`): the tap removes the poster in the same tick, the curtain opens, and a hold button waiting to pop is visible afterwards. Tests in Tasks 3, 4 and 6.
4. **A muted player, or a game without decoration sound:** the tap does not call `unlockSound()`. Test in Task 4.
5. **Round 0 and positive rounds:** no sign bar, print reads `№ 0` / `№ 3`; three-digit numbers and a name with „ß“ fit. Pure parts in Task 2, the fit by hand in Task 9.

---

### Task 1: Branch and the curtain signal

**Files:**
- Create: `src/ui/curtain.ts`, `src/ui/__tests__/curtain.spec.ts`

**Interfaces:**
- Produces: `CURTAIN_KEY: InjectionKey<Readonly<Ref<boolean>>>`; `provideCurtain(open: Readonly<Ref<boolean>>): void`; `useCurtainOpen(): Readonly<Ref<boolean>>` — `true` wherever no ramp provides one.

- [ ] **Step 1: Cut the branch.** The spike stays on its branch, local only.

```bash
git fetch origin
git switch -c feature/round-ramp origin/develop
git cherry-pick $(git rev-list --reverse b902b289..feature/game-rampe-intro-scene-53ca6b -- docs/superpowers)
```

Expected: spec and this plan are on the new branch; `ls webapp-vue/src/spike` fails.

- [ ] **Step 2: Write the failing test** in `curtain.spec.ts`:

```ts
it('is open where nothing provides one', () => {
  const Probe = defineComponent({ setup: () => ({ open: useCurtainOpen() }), template: '<i>{{ open }}</i>' })
  expect(mount(Probe).text()).toBe('true')
})

it('follows the provider', async () => {
  const open = ref(false)
  const Host = defineComponent({ components: { Probe }, setup: () => provideCurtain(open), template: '<Probe />' })
  const w = mount(Host)
  expect(w.text()).toBe('false')
  open.value = true
  await nextTick()
  expect(w.text()).toBe('true')
})
```

- [ ] **Step 3: Run** `pnpm test src/ui/__tests__/curtain.spec.ts` — FAIL, module missing.
- [ ] **Step 4: Implement `curtain.ts`** with `provide`/`inject`, as `communities/context.ts` does. The header comment says what the signal means: something that performs on load waits until nothing stands in front of its card. Name it so nobody confuses it with `soundOnStage` (a sounding board is on screen).
- [ ] **Step 5: Run** — PASS. **Commit.**

---

### Task 2: Poster text and variation (pure)

**Files:**
- Create: `src/ui/ramp/posterText.ts`, `src/ui/ramp/variation.ts`, `src/ui/ramp/__tests__/posterText.spec.ts`, `src/ui/ramp/__tests__/variation.spec.ts`

**Interfaces:**
- Produces, `posterText.ts`:
  - `interface RampScene { game: string; roundNumber: number; phaseTwo: boolean; points: number | null }`
  - `posterName(game: string): string` — „ß“ → „ẞ“ (CSS upper-casing would make it „SS“)
  - `roundLabel(roundNumber: number): string` — `-98` → `−98`
  - `stakeLine(points: number | null): string | null` — `null` for `null` or `≤ 0`
  - `rampLabel(scene: RampScene): string` — the button's name
- Produces, `variation.ts`:
  - `type PosterStyle = 'band' | 'sheet'`; `type FaceName = 'system' | 'fraunces-digits'`
  - `TILTS = [-9, 0, 9] as const`
  - `posterOf(roundNumber: number): { style: PosterStyle; tilt: -9 | 0 | 9; face: FaceName }`

- [ ] **Step 1: Write the failing tests.**

```ts
// posterText.spec.ts
expect(posterName('Anmaßung')).toBe('Anmaẞung')
expect(roundLabel(-98)).toBe('−98')
expect(roundLabel(0)).toBe('0')
expect(roundLabel(3)).toBe('3')
expect(stakeLine(12)).toBe('12 Punkte zum Abstauben')
expect(stakeLine(1)).toBe('1 Punkt zum Abstauben')
expect(stakeLine(null)).toBeNull()
expect(stakeLine(0)).toBeNull()
expect(rampLabel({ game: 'Verrohrung', roundNumber: -98, phaseTwo: false, points: null }))
  .toBe('Aktuelle Runde −98: Verrohrung. Öffnen.')
expect(rampLabel({ game: 'Peilung', roundNumber: -98, phaseTwo: true, points: 12 }))
  .toBe('Aktuelle Runde −98: Peilung. 12 Punkte zum Abstauben. Öffnen.')
```

```ts
// variation.spec.ts — vectors computed from the spike's mix
it.each([
  [-101, 'sheet', 0, 'fraunces-digits'],
  [-100, 'band', -9, 'system'],
  [-99, 'sheet', -9, 'system'],
  [-98, 'band', 0, 'fraunces-digits'],
  [-1, 'sheet', 9, 'system'],
  [0, 'band', -9, 'system'],
  [1, 'sheet', 0, 'fraunces-digits'],
  [17, 'sheet', 0, 'system'],
])('round %i', (n, style, tilt, face) => {
  expect(posterOf(n)).toEqual({ style, tilt, face })
})

it('never repeats a style on the next round', () => {
  let repeat: number | null = null
  for (let n = -400; n < 50; n++) if (posterOf(n).style === posterOf(n + 1).style) repeat ??= n
  expect(repeat).toBeNull()
})
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `style`: `Math.abs(n) % 2 === 0 ? 'band' : 'sheet'`. `tilt`: `TILTS[mix % 3]`. `face`: `['system', 'fraunces-digits'][(mix >>> 8) % 2]`. The mix, verbatim from the spike:

```ts
function mix(n: number): number {
  let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
```

- [ ] **Step 4: Run** — PASS. **Commit.**

---

### Task 3: The two posters

**Files:**
- Create: `src/ui/ramp/poster.ts`, `src/ui/ramp/poster.css`, `src/ui/ramp/PosterPrint.vue`, `src/ui/ramp/BandPoster.vue`, `src/ui/ramp/SheetPoster.vue`, `src/ui/ramp/__tests__/posters.spec.ts`, `src/__tests__/ownFonts.spec.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (`pnpm add @fontsource-variable/fraunces`)

**Interfaces:**
- Consumes: Task 2 (`RampScene`, `posterName`, `roundLabel`, `stakeLine`, `rampLabel`, `FaceName`).
- Produces: both posters take `RampScene`'s four fields plus `{ running: boolean; tilt: -9 | 0 | 9; face: FaceName }` and emit `open: []` (tap accepted) then `gone: []` (run-out finished).

Port from the spike: `poster.ts` (`posterColors`, `LINE`, `PROBE_PX`, `useTypeWidth` with its clipped probe host, `Strip`, `runOut`), `poster.css`, `PosterPrint.vue`, `EchoPoster.vue` → `BandPoster.vue`, `SheetPoster.vue`, and `mayAnimate` from `ramp.ts`. Differences from the spike:

- `BandPoster` has no `band` prop: the centre line is always the knocked-out band.
- `posterName`/`roundLabel` come from `posterText.ts`; `posterOf`, `TILTS` and `mix` live in `variation.ts`.
- The face is a `FaceName`. `poster.ts` maps it to CSS: letters always the system type; digits Fraunces for `'fraunces-digits'` (`'opsz' 144, 'SOFT' 0, 'WONK' 1`, weight 900, `letter-spacing: -0.03em`, cap 0.7), else the system type (cap 0.72).
- `points` is `number | null`; the stake print renders `stakeLine(points)` and only in phase two.
- The root `<button>` carries `:aria-label="rampLabel(…)"`, `data-test="ramp-poster"`, and a focus ring that survives the clip: `focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-current`.
- `import '@fontsource-variable/fraunces/full.css'` stands in `SheetPoster.vue`, nowhere else.
- No `card` prop: a poster moves only itself.

- [ ] **Step 1: Write the failing tests** in `posters.spec.ts`, for both posters via `describe.each`:

```ts
const scene = { game: 'Anmaßung', roundNumber: -98, phaseTwo: true, points: 12 }
const props = { ...scene, running: true, tilt: 0 as const, face: 'system' as const }

it('names the round', () => {
  const w = mount(Poster, { props })
  expect(w.get('[data-test="ramp-poster"]').attributes('aria-label'))
    .toBe('Aktuelle Runde −98: Anmaßung. 12 Punkte zum Abstauben. Öffnen.')
  expect(w.text()).toContain('Aktuelle Runde')
  expect(w.text()).toContain('Anmaẞung')
  expect(w.text()).toContain('12 Punkte zum Abstauben')
})

it('drops the stake in phase one', () => {
  expect(mount(Poster, { props: { ...props, phaseTwo: false } }).text()).not.toContain('Abstauben')
})

// happy-dom has no Element.animate: nothing may animate, so the tap is over in one go.
it('opens and is gone at once where nothing may animate', async () => {
  const w = mount(Poster, { props })
  await w.get('[data-test="ramp-poster"]').trigger('click')
  await flushPromises()
  expect(w.emitted('open')).toHaveLength(1)
  expect(w.emitted('gone')).toHaveLength(1)
})

it('opens once however often it is tapped', async () => {
  const w = mount(Poster, { props })
  const button = w.get('[data-test="ramp-poster"]')
  await button.trigger('click')
  await button.trigger('click')
  await flushPromises()
  expect(w.emitted('open')).toHaveLength(1)
  expect(w.emitted('gone')).toHaveLength(1)
})
```

Sheet only: `roundNumber: -98` shows `98` and one `[data-test="ramp-sign"]` in the solid print; `roundNumber: 0` and `3` show none.
Band only: the print reads `№ −98`.

`ownFonts.spec.ts`: read `index.html` and every `.css`/`.vue`/`.ts` under `src/` with `node:fs`; collect the first file matching `/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/`; assert it is `null`.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** by porting as listed. Keep the three traps the spike found, each with its one-line comment: `items-stretch` on the sheet's `<button>` (WebKit), the clipped probe host, Fraunces' pinned optical size.
- [ ] **Step 4: Run** — PASS. `pnpm build` succeeds and `dist/assets` holds a `fraunces-*.woff2`.
- [ ] **Step 5: Commit.**

---

### Task 4: `RoundRamp`

**Files:**
- Create: `src/ui/ramp/RoundRamp.vue`, `src/ui/ramp/__tests__/RoundRamp.spec.ts`

**Interfaces:**
- Consumes: `provideCurtain` (Task 1); `RampScene` (Task 2); `posterOf` (Task 2); the posters (Task 3); `gameSoundOn` from `@/ui/soundOutput`; `soundOnStage` from `@/ui/useSoundAwake`; `unlockSound` from `@/ui/audio`.
- Produces: `<RoundRamp :scene="RampScene | null"><!-- the card --></RoundRamp>`.

Behaviour:

- `scene` decides **once, at mount**: `null` → no ramp, curtain open from the start. Non-null → the ramp stands.
- States `up → leaving → gone`; never back. If `scene` turns `null` while not gone, jump to `gone`.
- Markup, from the spike's `RampTile`: one `grid grid-cols-1`; the card wrapper (`data-test="ramp-card"`, `tabindex="-1"`, `col-start-1 row-start-1 min-w-0`) is `invisible` while `up` and `inert` until `gone`; above it, while not `gone`, `data-test="ramp"` with `round-bleed relative col-start-1 row-start-1 overflow-hidden sm:rounded-xl`.
- The poster is `posterOf(scene.roundNumber)`; `running` is "on screen and `up`" (`useIntersectionObserver`; treat a missing `IntersectionObserver` as on screen).
- `open`, synchronously inside the click: `if (gameSoundOn() && soundOnStage.value) unlockSound()`; state `leaving`. The ramp itself plays no sound.
- `gone`: state `gone`; focus the card wrapper with `preventScroll: true`.
- `provideCurtain(computed(() => state === 'gone'))`.

- [ ] **Step 1: Write the failing tests.** Mock `@/ui/audio` (`unlockSound: vi.fn()`), `@/ui/soundOutput` (`gameSoundOn`) and `@/ui/useSoundAwake` (`soundOnStage` as a `ref`). A slot child shows `useCurtainOpen()`.

```ts
it('stands in front of a card that cannot be used', () => {
  const w = mountRamp(scene)
  expect(w.find('[data-test="ramp"]').exists()).toBe(true)
  expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeDefined()
  expect(w.get('[data-test="ramp-card"]').classes()).toContain('invisible')
  expect(curtain(w)).toBe('false')
})

it('is not there without a scene', () => {
  const w = mountRamp(null)
  expect(w.find('[data-test="ramp"]').exists()).toBe(false)
  expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeUndefined()
  expect(curtain(w)).toBe('true')
})

it('opens on a tap: card usable, curtain open, focus on the card', async () => {
  const w = mountRamp(scene, { attachTo: document.body })
  await w.get('[data-test="ramp-poster"]').trigger('click')
  await flushPromises()
  expect(w.find('[data-test="ramp"]').exists()).toBe(false)
  expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeUndefined()
  expect(w.get('[data-test="ramp-card"]').classes()).not.toContain('invisible')
  expect(curtain(w)).toBe('true')
  expect(document.activeElement).toBe(w.get('[data-test="ramp-card"]').element)
})

it.each([
  [true, true, 1],   // sound on, a sounding board on screen
  [false, true, 0],  // muted
  [true, false, 0],  // a silent game: waking would claim the audio session for nothing
])('wakes the sound only where it would be heard', async (on, onStage, calls) => {
  vi.mocked(gameSoundOn).mockReturnValue(on)
  soundOnStage.value = onStage
  const w = mountRamp(scene)
  await w.get('[data-test="ramp-poster"]').trigger('click')
  expect(unlockSound).toHaveBeenCalledTimes(calls)
})

it('goes at once when its scene goes', async () => {
  const w = mountRamp(scene)
  await w.setProps({ scene: null })
  expect(w.find('[data-test="ramp"]').exists()).toBe(false)
  expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeUndefined()
})

it('does not come back for a scene that arrives later', async () => {
  const w = mountRamp(null)
  await w.setProps({ scene })
  expect(w.find('[data-test="ramp"]').exists()).toBe(false)
})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit.**

---

### Task 5: `RoundCard` raises the ramp

**Files:**
- Modify: `src/rounds/RoundCard.vue`
- Test: `src/rounds/__tests__/RoundCard.spec.ts`

**Interfaces:**
- Consumes: `RoundRamp`, `RampScene`.

`RoundCard` wraps its `<RoundSurface>` (not the notice above it) in `<RoundRamp :scene="rampScene">`. `rampScene` is `null` unless **all** hold: not `closed`; a renderer exists (`component !== null`); `face` is `'sealed'` or `'playing'`; `play === null` (no timed play running); `round.round.number` and `round.game.displayName` are present (`== null` check: round `0` is a round). Then `{ game: displayName, roundNumber: number, phaseTwo: awardRule === 'CLOSEST_ONLY', points: phaseTwo ? awardPoints : null }`.

- [ ] **Step 1: Write the failing tests** — the spec's table, row by row, asserting on `w.findComponent(RoundRamp).props('scene')`:

| Case | Expect |
|---|---|
| `stage: 'sealed'`, game requires reveal | scene with the round's number and name |
| `stage: 'playing'`, untimed | scene |
| `stage: 'playing'`, `scoresOnDuration: true`, `me.revealedAt` set, not guessed | `null` |
| `stage: 'done'` | `null` |
| `closed: true` | `null` |
| game id without a renderer | `null` |
| `round.round.number` missing | `null` |
| round number `0` | scene with `roundNumber: 0` |
| `awardRule: 'CLOSEST_ONLY'`, `awardPoints: 12` | `phaseTwo: true`, `points: 12` |
| phase one with `awardPoints: 12` | `phaseTwo: false`, `points: null` |

Plus: after the ramp has gone, `setProps` with a round of another number (the 409 reload) leaves no `[data-test="ramp"]`.

Existing tests that click the stub game now find it under a ramp. A dispatched event ignores `inert`, so they should keep passing. If one fails, open the ramp first in that test; do not weaken its assertion.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the whole suite — PASS. **Step 5: Commit.**

---

### Task 6: The hold button waits for the curtain

**Files:**
- Modify: `src/ui/HoldButton.vue`
- Test: `src/ui/__tests__/HoldButton.spec.ts`

**Interfaces:**
- Consumes: `useCurtainOpen`, `CURTAIN_KEY` (tests provide it via `global.provide`).

Today the control springs in when `ready` flips to `true` after mount (START on every `RevealCover`; Farbausmalung once its wheel has drawn itself). Under a ramp that flip happens unseen. New rule:

- `ready` flips while the curtain is open → pop, as today.
- `ready` flips while it is closed → the pop is owed. Until it is paid, `[data-test="hold-pop"]` is `invisible`: the card shows through the run-out's gaps and the control must not stand there before it springs in.
- The curtain opens with a pop owed → pay it: visible, then the same animation.
- Where nothing may animate, paying it only makes the control visible.
- `ready` already `true` at mount: nothing owed, nothing hidden, no pop — unchanged.

- [ ] **Step 1: Write the failing tests**, next to the existing pop tests and with their `installAnimate()`:

```ts
it('owes its pop while the curtain is closed, and pays when it opens', async () => {
  const animate = installAnimate()
  const open = ref(false)
  const w = mount(HoldButton, { props: { ...base, ready: false }, global: { provide: { [CURTAIN_KEY as symbol]: open } } })
  await w.setProps({ ready: true })
  expect(animate).not.toHaveBeenCalled()
  expect(w.get('[data-test="hold-pop"]').classes()).toContain('invisible')
  open.value = true
  await nextTick()
  expect(animate).toHaveBeenCalledTimes(1)
  expect(w.get('[data-test="hold-pop"]').classes()).not.toContain('invisible')
})

// No installAnimate(): happy-dom has no Element.animate, so nothing may animate.
it('shows itself without a pop where nothing may animate', async () => {
  const open = ref(false)
  const w = mount(HoldButton, { props: { ...base, ready: false }, global: { provide: { [CURTAIN_KEY as symbol]: open } } })
  await w.setProps({ ready: true })
  expect(w.get('[data-test="hold-pop"]').classes()).toContain('invisible')
  open.value = true
  await nextTick()
  expect(w.get('[data-test="hold-pop"]').classes()).not.toContain('invisible')
})

it('hides nothing when it was ready from the start', () => {
  const w = mount(HoldButton, { props: { ...base, ready: true }, global: { provide: { [CURTAIN_KEY as symbol]: ref(false) } } })
  expect(w.get('[data-test="hold-pop"]').classes()).not.toContain('invisible')
})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, the existing pop tests untouched. **Step 5: Commit.**

---

### Task 7: The three games' entrances wait

**Files:**
- Modify: `src/games/matchscale/MatchScaleBoard.vue`, `src/games/matchscale/ScaleField.vue`, `src/games/guesshue/HueWheelInput.vue`, `src/games/songsnippet/StageBar.vue`
- Test: `src/games/matchscale/__tests__/MatchScaleBoard.spec.ts`, `ScaleField.spec.ts`, `src/games/guesshue/__tests__/HueWheelInput.spec.ts`, `src/games/songsnippet/__tests__/StageBar.spec.ts`

**Interfaces:**
- Consumes: `useCurtainOpen`, `CURTAIN_KEY`.
- Produces: `ScaleField` gains `popHeld?: boolean`.

One cycle per game; in each, the existing tests (no provider) must pass unchanged — that is "without a ramp, as today".

- [ ] **Augenmaß.** `MatchScaleBoard` calls `playPop()` once, when the curtain is open: at mount if it already is, else when it opens. It passes `:pop-held="!curtainOpen"`. `ScaleField` adds `animationPlayState: 'paused'` to `popStyle` while `popHeld`; `animation-fill-mode: both` then keeps the shapes at `scale(0)`.
  Tests: curtain closed → `playPop` (mocked `./countSound`) not called, the field receives `popHeld: true`; opened → called once, `popHeld: false`. `ScaleField`: `popIn` + `popHeld` → the pop group's inline style has `animation-play-state: paused`; without `popHeld` it has none.
- [ ] **Farbausmalung.** `HueWheelInput` starts its boot sweep when the curtain is open; until then it stays as before its first frame and does not emit `boot-done`. Where nothing may animate it finishes at mount as today, curtain or not: there is no entrance to wait for.
  Tests (fake timers / stubbed `requestAnimationFrame`, as the spec already does): closed → no frame requested, no `boot-done`; opened → the sweep runs to `boot-done`.
- [ ] **Anspielung.** `StageBar`'s `grown` flips two frames after the curtain is open, not two frames after mount.
  Tests: closed → the unlocked fill stays at `0%` after the frames; opened → it reaches its width.
- [ ] **Run** the suite — PASS. **Commit** (one commit; the message names all three).

---

### Task 8: The lab's switch

**Files:**
- Modify: `src/gamelab/LabControls.vue`, `src/pages/c/[slug]/lab/[game]/index.vue`
- Test: `src/gamelab/__tests__/lab-controls.spec.ts`, `src/gamelab/__tests__/lab-page.spec.ts`

**Interfaces:**
- `LabControls` gains prop `ramp: boolean` and emit `rampChange: [on: boolean]`: a row in the drawer's geometry (`h-11 px-5 text-sm`) with a checkbox `data-test="lab-ramp"` labelled „Rampe“.
- The page: `ramp = route.query.ramp === '1'`; `writeRamp(on)` replaces the query like `writePhase`, setting `ramp: '1'` or removing the key.

The page wraps its `<RoundSurface>` in `<RoundRamp>`:

- `scene` is `null` unless the switch is on, `round.me == null` and `labPlay === null`; then `{ game: round.displayName, roundNumber: labRoundNumber(round.seed), phaseTwo: round.awardRule === 'CLOSEST_ONLY', points: phaseTwo ? round.awardPoints : null }`.
- `:key` is `` `${round.seed}-${rampRaise}-${ramp}` ``, so the ramp stands again after a roll, after the switch, and after the round went back to unplayed. `rampRaise` is a counter bumped in `run()` beside `resealCount`: when the tester had an entry before the call and has none after, or the round was revealed before and is not after. Bumping it in `run()` covers the drawer buttons and the `X`/`Z` shortcuts alike.

The lab takes no backend change, no shortcut key.

- [ ] **Step 1: Write the failing tests.**
  - `lab-controls.spec.ts`: the checkbox reflects `ramp`; a change emits `rampChange` with the new value.
  - `lab-page.spec.ts`, following its existing setup: without `?ramp=1` → `RoundRamp`'s `scene` is `null`; with it and an unplayed round → a scene with `roundNumber: labRoundNumber(seed)`; with it and `me` set → `null`; after a reset that clears `me` → a fresh `RoundRamp` instance with a scene (assert `[data-test="ramp"]` exists again); toggling the control writes `ramp=1` into the route and removes it again.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit.**

---

### Task 9: By hand, and what goes back into the guidelines

happy-dom computes no layout: the fit, the drift and the run-out are checked by eye. Start backend and frontend as `CLAUDE.md` says; the lab needs `app.gamelab.enabled`. Phone over LAN HTTP, iOS in the simulator (iPhone 16 Pro).

- [ ] **Lab, per style** (roll until both have shown): short and long name, one- to three-digit number, both phases, all three tilts. Check: name ends at the gutter on both sides; the sign bar is as wide as the digits; the strips run out with their drift; the card is usable only when the last strip is gone.
- [ ] **Entrances:** Augenmaß pops and knocks after the ramp is gone, not before; START springs in after it on a sealed round; Farbausmalung's wheel and button, Anspielung's bar likewise. Without the lab switch all four behave as before.
- [ ] **Sound:** fresh load, tap the ramp, the header's switch shows "on", the first move knocks. Muted: the tap leaves the switch muted.
- [ ] **Report to the user**, they decide (spec, *Im Lab herauszufinden*): the poster in front of a game much taller than a square; whether Fraunces visibly swaps in; ramp then START in phase two.
- [ ] **Real round** on the community page: ramp on load, none after the guess, none on reload of a played round, none in the history.
- [ ] **Guidelines** ([feeding-knowledge-back.md](../../../.claude/guidelines/feeding-knowledge-back.md): only what bites again elsewhere and has no guardrail). Candidates: WebKit starts a `<button>`'s flex items at the left (`frontend-ui.md`, sizing traps); a hidden measuring element on `body` widens the page (`frontend-ui.md`); "performs on load → waits for `useCurtainOpen()`" (`frontend-state.md`, beside `useSoundStage`); fonts ship from the app's own origin (`frontend.md`). Write each as one rule, not a story.
- [ ] **Final run:** `pnpm test && pnpm exec vue-tsc -b && pnpm lint && pnpm build`, all clean; `git status` shows nothing under `src/spike`. **Commit.** Then stop: push and PR are the user's call.
