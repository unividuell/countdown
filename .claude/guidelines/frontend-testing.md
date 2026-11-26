# Frontend — testing (webapp-vue)

Vitest + @vue/test-utils + happy-dom. Siblings: [frontend.md](frontend.md)
(stack, HTTP, tooling), [frontend-ui.md](frontend-ui.md),
[frontend-routing.md](frontend-routing.md), [frontend-state.md](frontend-state.md).

## Setup

- **Vitest + @vue/test-utils + happy-dom**, unit level. Mocking is Vitest's `vi`
  (`vi.stubGlobal` for `fetch`/`location`, `vi.mock` for modules) — not mockk/kotest, the Kotlin
  backend's convention.
- **Specs are type-checked only because `tsconfig.vitest.json` sets `"exclude": []`.** `extends`
  *replaces* `exclude`; inheriting `tsconfig.app.json`'s cancels the whole `include`, and
  `vue-tsc -b` reports success over an empty program. Check with
  `npx vue-tsc -b --listFiles | grep -c __tests__` — `0` means the specs dropped out.
- **Two source files whose names differ only in case are one file on a Mac.** `GameHeader.vue`
  beside `gameHeader.ts` compiles, but their specs overwrite each other in silence. Name a helper
  after what it does (`remainingClock.ts`, `board.ts`), never after the component it serves.
- **Every Vite plugin the app relies on is registered in `vitest.config.ts` as well.** Without
  `VueRouter()` (before `vue()`) `vue-router/auto-routes` can't resolve and `definePage`'s `meta`
  never reaches the component; without `Icons()` every `~icons/*` import fails.

## What to assert

- **Real behaviour, not mock echoes:** the `RequestInit` sent to `fetch`, `router.currentRoute`
  after navigation (guard tests use a `createMemoryHistory` router).
- **`trigger('click')` is swallowed on a `disabled` element,** so "clicking does nothing" proves
  nothing about a handler's guard. Assert `attributes('disabled')` for the affordance, and drive
  the handler from an enabled state for the guard.
- **Space on a hand-rolled control: assert `defaultPrevented`.** `trigger('keydown.space')` cannot
  see a dropped `.prevent`. Dispatch a real
  `new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })` and check it.
- **`wrapper.unmount()` erases that instance's `emitted()` record.** Assert before the unmount.
  After it, a test can still prove nothing fires (`vi.getTimerCount()`, an `animate` spy).
- **A fixture handed to `vi.mocked(apiFetch).mockResolvedValue(...)` is not type-checked.** Anchor
  the literal — `{ … } satisfies CommunityResponse`, or a typed binding — so a wire-type change
  fails on the fixture.
- **A prop passed through `<component :is>` is not type-checked** (`Component`'s props are `any`).
  A test asserting the prop reached the child is the only guard. `RoundCard.spec.ts`,
  `lab-page.spec.ts`.
- **An object prop does not survive a props hop by identity** — `mount()` makes props reactive, so
  `toBe` never holds and `toStrictEqual` only compares shape. Call through the handed-down object
  (`await stub.props('review').vote(…)`, `stub.props('assets').url('board')`). Function props are
  not wrapped.
- **`expect(w.get(sel).exists()).toBe(true)` asserts nothing** — `get()` already throws. `find()`
  when presence is the claim, `get()` when you go on to use the node.
- **`w.get(sel).element` is an `Element`, without `.style`.** Pass the type argument:
  `w.get<HTMLElement>(sel)` (`HueWheelInput.spec.ts`'s `styleOf`).
- **Never put `expect()` inside a hot loop.** An assertion costs far more than the code it guards,
  and the test nears the 5 s timeout. Accumulate the first violation, assert once — it also names
  the draw index.

## happy-dom limits

- **No CSS and no box sizes are computed** ([frontend-ui.md](frontend-ui.md)). An inline value it
  cannot parse is dropped whole: `calc(14px + (100% - 14px) * f)` leaves no `width` — write
  `calc(a% + bpx)`.
- **A zero rect makes pointer geometry silently *pass* — stub the rect.**
  `getBoundingClientRect()` answers all zeroes, so a guard like `distance < 0.3 × radius` reads
  `0 < 0` for every input and every path looks covered.
  ```ts
  vi.spyOn(el.element, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
  ```
- **`setPointerCapture` is absent from happy-dom elements.** Stub it per test and say which test
  the stub pins, or the stub becomes what makes the suite pass.
- **`window.confirm` does not exist in happy-dom,** so `vi.spyOn(window, 'confirm')` throws.
  `vi.stubGlobal('confirm', vi.fn(() => answer))`, and `vi.unstubAllGlobals()` in `afterEach`.
- **`FormData.append(name, blob, fileName)` ignores `fileName` for a plain `Blob`.** Pass a `File`
  in the spec.
- **`Element.prototype.animate` exists and runs (happy-dom ≥ 20.12),** so a component's capability
  check passes and a spec reading the resting appearance reads it mid-transition. Say which path
  you want:
  - observing the animation: install a spy —
    `Object.defineProperty(Element.prototype, 'animate', { value: vi.fn(), configurable: true, writable: true })`;
  - reading the rest state: `Reflect.deleteProperty(Element.prototype, 'animate')` in `beforeEach`.

  Note *which* path animates: `FlipDotBoard` animates only inside its watcher, so a mount-only test
  never reaches it. `FlipDotBoard.spec.ts` (spy), `CountdownCard.spec.ts` (delete).
- **`matchMedia` exists; preference queries answer `false`,** width queries are evaluated against
  happy-dom's 1024px viewport. Reduced motion needs a stub:
  `vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)`.
- **A width-dependent component needs `happyDOM.setViewport({ width })`, not `window.innerWidth`** —
  the latter moves `useWindowSize()` but not `matchMedia()`. `NavDrawer.spec.ts`'s
  `setViewportWidth`.
- **VueUse's `onClickOutside` does not fire.** A component whose outside click a spec must drive
  listens directly: `useEventListener(document, 'click', …)` plus a `contains` check
  (`NavDrawer.vue`).

## Driving a live page

- **A synthetic `PointerEvent` is not a pointer.** `setPointerCapture` throws for an id the browser
  is not tracking and the listener's exception is swallowed, so a hand-dispatched drag does
  nothing and reads as a broken feature. Only the real primary-mouse id tends to work.
- **Read a value in a later call than the dispatch.** Vue flushes on the next tick; the same turn
  still shows the old attribute.

## Browser-automation pane limits

- **The pane's page runs with `document.hidden` permanently `true`,** below the JS-visible flag —
  overriding it changes nothing. `requestAnimationFrame` gets no callbacks, a CSS transition shows
  no progress.
- **A forced screenshot does paint,** with the wall-clock time since the previous forced paint. So
  `interaction → screenshot → wait → screenshot` samples an animation at chosen instants.
- **`getAnimations()` answers the timeless questions only.** A frozen animation never finishes but
  never leaves the list either: a before/after count around one action says whether that action
  cancelled anything. Ask the pane what *is*, never how long.
- **To see an animation play, film the iOS simulator.** `xcrun simctl io booted recordVideo x.mp4`
  as a background job, the gesture through the simulator tool, `pkill -INT -f recordVideo`, then
  `ffmpeg -i x.mp4 -vf "fps=10,crop=…,scale=…,tile=8x5" -frames:v 1 sheet.png`: one contact sheet,
  a frame per 100 ms. That shows what moved and when — how the hold's charge was checked.
- **Animation *feel* is a human's call** — one more reason the resting state must be correct with
  the animation absent
  ([frontend-ui.md](frontend-ui.md#animation-on-a-phones-main-thread)).

## Doubles & lifecycle

- **A second `vi.spyOn` on an already-spied module function reuses that spy, call history
  included.** Add `afterEach(() => vi.restoreAllMocks())` wherever a spec re-spies the same import
  (`landingGuard.spec.ts`).
- **Under `stubs: { teleport: true }`, grab elements *after* the state change that re-renders the
  teleported slot.** A node captured before is a detached copy, and every stub on it
  (`clientHeight`, a mocked rect) is read past in silence. `w.get(...).element === captured` is the
  check when a stubbed measurement has no effect.
- **A composable double whose value a template binds directly is a real `ref()`,** not a
  `{ value }` object: `<script setup>` falls back to a runtime `isRef()` check, so the wrapper
  itself lands in `v-if` and props, with no error (`app-header.spec.ts`). A value only read via
  `.value` in script may stay a plain object (`useCommunityContext()`'s `community`).
- **Doubles for `router.push`/`replace` are `vi.fn().mockResolvedValue(undefined)`** — production
  code attaches `.catch(...)`, which throws on a bare `vi.fn()`'s `undefined`.
- **`enableAutoUnmount(afterEach)` in every spec that mounts a component with module-level
  state.** A wrapper left mounted keeps a live watcher on the module ref, and the next case's tick
  reaches it. Unmount **before** a `_reset*State()` hook: resetting zeroes a refcount without
  unmounting anyone.
- **Fake timers + router guards: `vi.advanceTimersByTimeAsync`.** Vue Router resolves guards
  through several promise hops, so a guard-armed `setTimeout` may not exist yet; the synchronous
  form advances nothing. `ui/navigationProgress.ts` and its spec.
- **`AbortSignal.timeout` is not driven by `vi.useFakeTimers()`.** Stub the factory —
  `vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)` — and call
  `controller.abort()`: drive the signal, not the clock (`api/__tests__/client.spec.ts`).
