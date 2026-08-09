# Game-Lab-Verbesserungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Game-Lab erhält einen stabilen initialen Seed, schnelle sichere Aktionen und eine erkennbare mobile Drawer-Überlaufkante.

**Architecture:** Die Lab-Route bleibt Eigentümerin aller asynchronen Rundenaktionen. Ein typisierter, modullokaler `nav`-Kanal fordert das Schließen an, ohne den Open-State aus `NavDrawer` herauszuheben. Reine Helfer bestimmen den Initial-Seed und erkennen die Shortcuts.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, VueUse, Vue Router 5, Tailwind v4, Lucide via unplugin-icons, Vitest.

## Global Constraints

- Nur `webapp-vue` ändern; die vorhandenen Backend-Endpunkte und Zugriffsregeln bleiben unverändert.
- Source und Tests Englisch; sichtbare deutsche Texte verwenden `„…“`.
- `NavDrawer` bleibt alleiniger Eigentümer seines Open-State.
- `⌘⇧Z` löscht nur den eigenen Tipp; `⌘⇧X` setzt die gesamte Runde zurück.
- Shortcuts ignorieren editierbare Ziele und Busy-Zustände.
- Ein fehlender oder ungültiger Seed wird als signierter FNV-1a-32-Hash der UTF-8-Spiel-ID geschrieben.
- Der Scroll-Hinweis ist rein dekorativ und nur sichtbar, wenn unterhalb noch Inhalt folgt.
- Der letzte Task entscheidet anhand der Aufnahmehürde über eine Guideline-Änderung.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/gamelab/seed.ts` | Seed parsen, würfeln und Initial-Seed berechnen. |
| `src/gamelab/shortcuts.ts` | Reine Shortcut-Erkennung. |
| `src/nav/drawerControl.ts` | Typisierte Close-Anforderung. |
| `src/nav/NavDrawer.vue` | Close-Abonnement und Scroll-Hinweis. |
| `src/gamelab/LabControls.vue` | Keycaps neben Drawer-Aktionen. |
| `src/gamelab/LabEntries.vue` | Eigenen Tipp löschen und ganze Liste zurücksetzen. |
| `src/pages/c/[slug]/lab/[game].vue` | API-, Shortcut- und Close-Orchestrierung. |

### Task 1: Pure lab helpers

**Files:**
- Modify: `webapp-vue/src/gamelab/seed.ts`
- Create: `webapp-vue/src/gamelab/shortcuts.ts`
- Modify: `webapp-vue/src/gamelab/__tests__/seed.spec.ts`
- Create: `webapp-vue/src/gamelab/__tests__/shortcuts.spec.ts`

**Interfaces:** Produces `initialSeed(gameId: string): number` and `labShortcut(event: KeyboardEvent): 'forgetMine' | 'reset' | null`. The route consumes both in Task 4.

- [ ] **Step 1: Write failing seed tests**

Pin these signed vectors: `sample` → `-1763474777`, `guess-hue` → `-1512093407`, UTF-8 input `hütte` → `-965460697`. Assert the UTF-8 vector differs from a deliberately computed UTF-16-code-unit hash.

- [ ] **Step 2: Run the failing seed test**

Run: `pnpm --dir webapp-vue test -- --run src/gamelab/__tests__/seed.spec.ts`

Expected: FAIL because `initialSeed` is missing.

- [ ] **Step 3: Implement FNV-1a-32**

```ts
export function initialSeed(gameId: string): number {
  let hash = 0x811c9dc5 | 0
  for (const byte of new TextEncoder().encode(gameId)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash
}
```

- [ ] **Step 4: Write failing shortcut tests and run them**

Assert `metaKey + shiftKey + z` returns `forgetMine`, the equivalent `x` returns `reset`, and all other modifier combinations return `null`.

Run: `pnpm --dir webapp-vue test -- --run src/gamelab/__tests__/shortcuts.spec.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 5: Implement shortcut recognition**

```ts
export type LabShortcut = 'forgetMine' | 'reset'

export function labShortcut(event: KeyboardEvent): LabShortcut | null {
  if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey) return null
  if (event.key.toLowerCase() === 'z') return 'forgetMine'
  if (event.key.toLowerCase() === 'x') return 'reset'
  return null
}
```

Target-editability stays in the route listener, where the real target is available and gets a component test in Task 4.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --dir webapp-vue test -- --run src/gamelab/__tests__/seed.spec.ts src/gamelab/__tests__/shortcuts.spec.ts`

Expected: PASS.

```bash
git add webapp-vue/src/gamelab/seed.ts webapp-vue/src/gamelab/shortcuts.ts webapp-vue/src/gamelab/__tests__/seed.spec.ts webapp-vue/src/gamelab/__tests__/shortcuts.spec.ts
git commit -m "feat(gamelab): derive stable initial rounds"
```

### Task 2: Drawer command seam and overflow cue

**Files:**
- Create: `webapp-vue/src/nav/drawerControl.ts`
- Modify: `webapp-vue/src/nav/NavDrawer.vue`
- Modify: `webapp-vue/src/nav/__tests__/NavDrawer.spec.ts`

**Interfaces:** Produces `requestDrawerClose(): void` and `onDrawerCloseRequested(listener: () => void): () => void`. `NavDrawer` subscribes; Task 4 requests a close.

- [ ] **Step 1: Write failing NavDrawer tests**

Open the drawer, call `requestDrawerClose()`, await `nextTick()`, and assert `aria-expanded` is false. For overflow, override `nav-scroll` dimensions to `clientHeight=100`, `scrollHeight=200`, `scrollTop=0`, dispatch `scroll`, and assert `[data-test="nav-scroll-cue"]`; at `scrollTop=100` assert it is absent.

- [ ] **Step 2: Run the failing NavDrawer tests**

Run: `pnpm --dir webapp-vue test -- --run src/nav/__tests__/NavDrawer.spec.ts`

Expected: FAIL because channel and cue are absent.

- [ ] **Step 3: Implement `drawerControl.ts`**

```ts
const closeListeners = new Set<() => void>()
export function onDrawerCloseRequested(listener: () => void): () => void {
  closeListeners.add(listener)
  return () => closeListeners.delete(listener)
}
export function requestDrawerClose(): void {
  for (const listener of [...closeListeners]) listener()
}
```

- [ ] **Step 4: Implement drawer behavior**

Subscribe on mount and unregister on unmount; when requested and `open.value`, call the existing `setOpen(false)` path. Add a `navScroll` template ref and `scrollHintVisible` ref. Update it after opening, on the scroll element's `scroll`, and on resize while open:

```ts
scrollHintVisible.value = Boolean(el && el.scrollTop + el.clientHeight < el.scrollHeight - 1)
```

Wrap the scroll region relatively and render a pointer-events-none, aria-hidden gradient with `IconChevronDown` at its bottom when visible. Keep the footer outside the scroll region.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --dir webapp-vue test -- --run src/nav/__tests__/NavDrawer.spec.ts`

Expected: PASS.

```bash
git add webapp-vue/src/nav/drawerControl.ts webapp-vue/src/nav/NavDrawer.vue webapp-vue/src/nav/__tests__/NavDrawer.spec.ts
git commit -m "feat(nav): close the drawer on page requests"
```

### Task 3: Drawer keycaps and entry-list actions

**Files:**
- Modify: `webapp-vue/src/gamelab/LabControls.vue`
- Modify: `webapp-vue/src/gamelab/LabEntries.vue`
- Modify: `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`

**Interfaces:** `LabEntries` consumes `entries`, `busy`, `onForgetMine`, `onReset`; Task 4 supplies them.

- [ ] **Step 1: Write failing UI tests**

With `me` and one other entry, assert only the first row shows `[data-test="lab-entry-forget-mine"]`; assert `[data-test="lab-entries-reset"]` exists. Assert both drawer buttons contain decorative Command and Shift symbols plus letter keycaps.

- [ ] **Step 2: Run the failing page test**

Run: `pnpm --dir webapp-vue test -- --run src/gamelab/__tests__/lab-page.spec.ts`

Expected: FAIL because list actions and keycaps are missing.

- [ ] **Step 3: Implement both renderers**

In `LabControls`, import `~icons/lucide/command` and `~icons/lucide/arrow-up`; append an aria-hidden flex group and `<kbd>` `Z`/`X` to the two existing action buttons. In `LabEntries`, render a 44px delete button only for index zero and a reset button only when entries exist; bind `disabled` to `busy`. Preserve `v-if="entries.length > 0"` so the empty list remains invisible.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --dir webapp-vue test -- --run src/gamelab/__tests__/lab-page.spec.ts`

Expected: PASS.

```bash
git add webapp-vue/src/gamelab/LabControls.vue webapp-vue/src/gamelab/LabEntries.vue webapp-vue/src/gamelab/__tests__/lab-page.spec.ts
git commit -m "feat(gamelab): expose round actions beside entries"
```

### Task 4: Route orchestration

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game].vue`
- Modify: `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`

**Interfaces:** Consumes all Task 1–3 exports and binds the two callbacks to `LabEntries`.

- [ ] **Step 1: Write failing route tests**

Assert a missing/invalid seed calls router replace with `String(initialSeed('sample'))`, never `rollSeed()`. Spy on `requestDrawerClose`: a successful drawer refresh, reset, or own-delete calls it once; rejected API calls do not. Dispatch `⌘⇧Z`/`⌘⇧X` from `document` and assert their APIs and `defaultPrevented`; dispatch from `lab-seed` and assert neither. Hold `busy` with a deferred promise and assert shortcuts do nothing.

- [ ] **Step 2: Run the failing route tests**

Run: `pnpm --dir webapp-vue test -- --run src/gamelab/__tests__/lab-page.spec.ts`

Expected: FAIL because initial seed is random and the listener/close policy do not exist.

- [ ] **Step 3: Implement result-aware action execution**

Change `run` to take `closeDrawer = false`; retain current error mapping, set `round.value` on success, and call `requestDrawerClose()` only after that success when requested. Keep list callbacks and game submission at `false`; bind Teleport refresh/reset/forget handlers at `true`. Replace the seed repair call with `writeSeed(initialSeed(gameId.value))`.

- [ ] **Step 4: Install the shortcut listener**

Use VueUse `useEventListener(document, 'keydown', handler)`. The handler first rejects busy state, then uses `labShortcut`, then rejects targets matching `input, textarea, select, [contenteditable="true"], [contenteditable=""]`. Only then prevent default and call `void run(forgetMyLabEntry, true)` or `void run(resetLabRound, true)`.

- [ ] **Step 5: Wire list callbacks, verify, and commit**

Pass `:busy="busy"`, `:on-forget-mine="() => void run(forgetMyLabEntry)"`, `:on-reset="() => void run(resetLabRound)"` to `LabEntries`.

Run:

```bash
pnpm --dir webapp-vue typecheck
pnpm --dir webapp-vue lint
pnpm --dir webapp-vue test -- --run
```

Expected: all exit 0.

```bash
git add webapp-vue/src/pages/c/'[slug]'/lab/'[game]'.vue webapp-vue/src/gamelab/__tests__/lab-page.spec.ts
git commit -m "feat(gamelab): streamline lab round controls"
```

### Task 5: Feed knowledge back and final verification

**Files:**
- Inspect: `.claude/guidelines/feeding-knowledge-back.md`
- Modify only if all three admission questions pass: the relevant `.claude/guidelines/*.md`.

- [ ] **Step 1: Decide the guideline outcome**

Re-read the admission bar. Add one concise imperative rule only if the typed page-to-drawer seam or scroll-affordance lesson will recur outside this feature and no test/type guard already captures it. Otherwise record no guideline change.

- [ ] **Step 2: Run final verification**

```bash
pnpm --dir webapp-vue typecheck
pnpm --dir webapp-vue lint
pnpm --dir webapp-vue test -- --run
git diff --check
git status --short --branch
```

Expected: all checks pass, no whitespace errors, only intended changes.

- [ ] **Step 3: Record the expected no-change decision**

The current expected outcome is no guideline edit: this feature's page-to-drawer seam is local and
unit-tested, and the scroll cue is component-local UI behavior. If the re-read disproves either
claim, stop and amend this plan with the exact guideline file and rule before editing it. Do not
make an empty documentation commit.
