# Frontend — testing (webapp-vue)

Vitest + @vue/test-utils + happy-dom. Siblings: [frontend.md](frontend.md)
(stack, HTTP, tooling), [frontend-ui.md](frontend-ui.md),
[frontend-routing.md](frontend-routing.md), [frontend-state.md](frontend-state.md).

## Setup

- **Vitest + @vue/test-utils + happy-dom**, unit level. JUnit-style; kotest is NOT used here.
- **Mocking uses Vitest `vi`** (`vi.stubGlobal` for `fetch`/`location`, `vi.mock` for modules) — **NOT mockk/kotest** (those are the Kotlin backend's convention).
- **Specs are type-checked by `pnpm typecheck` — but only because `tsconfig.vitest.json` sets
  `"exclude": []`.** `extends` *replaces* `exclude`, it does not merge it, so inheriting
  `tsconfig.app.json`'s `"exclude": ["src/**/__tests__/**"]` cancels the vitest project's entire
  `include` and `vue-tsc -b` then reports success over an empty program. Nothing warns: the
  build exits 0, and every fixture typed against `src/api/types.ts` drifts silently until a wire
  type gains a required field and someone has to grep for the literals by hand. Never re-inherit
  that `exclude`, and check with
  `npx vue-tsc -b --listFiles | grep -c __tests__` (currently 79 files — a 0 means the specs
  dropped out of the program again).
- **Two source files whose names differ only in case are ONE file on a Mac.** A component and its
  helper module must therefore not share a name — `GameHeader.vue` beside `gameHeader.ts` compiles,
  but their specs collide and `Write` overwrites one with the other in silence, with no git conflict
  and no failing test until the lost assertions are noticed missing. Name the helper after what it
  does (`remainingClock.ts`, `board.ts`, `scoreboard.ts`), never after the component it serves.
- **Every Vite plugin the app relies on must be registered in `vitest.config.ts` as well.** It is a
  separate file from `vite.config.ts`, and a missing plugin fails as an unresolvable import or, worse,
  as a silently missing compile step: without `VueRouter()` (before `vue()`) `vue-router/auto-routes`
  can't resolve and `definePage`'s `meta` never reaches the compiled component; without `Icons()`
  every `~icons/*` import fails.

## What to assert

- Test **real behavior**, not mock echoes: assert on the actual `RequestInit` sent to `fetch`, on `router.currentRoute` after navigation (guard tests use a `createMemoryHistory` router), etc.
- **`trigger('click')` is swallowed on a `disabled` element, so "clicking it does nothing" proves
  nothing.** `DOMWrapper.trigger` (VTU 2.4) short-circuits and never dispatches, so the assertion
  passes purely because of the attribute — a handler-level guard behind a disabled button is *not*
  covered by it. Assert `attributes('disabled')` for what you actually mean (the affordance), and
  drive the handler from a state where the button is enabled to exercise the guard.
- **Space on a hand-rolled control: assert `defaultPrevented`, not just the handler.**
  `trigger('keydown.space')` cannot see whether `.prevent` is present, so a test that only checks the
  cycle advanced stays green when someone drops it — and the page starts scrolling on every
  activation. Dispatch a real event instead:
  `const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })`,
  `el.element.dispatchEvent(e)`, then `expect(e.defaultPrevented).toBe(true)`.
- **`wrapper.unmount()` erases that instance's whole `emitted()` record.** VTU 2.4.11 calls
  `removeEventHistory(this.vm)` inside `unmount()`, so `emitted('x')` afterwards is `undefined` no
  matter what fired — a post-unmount `emitted()` check cannot fail and is therefore worthless. Assert
  before the unmount. What a post-unmount test *can* prove is that nothing fires afterwards
  (`vi.getTimerCount()`, an `animate` spy).
- **A fixture handed to `vi.mocked(apiFetch).mockResolvedValue(...)` is not type-checked, even
  though the spec files are in the program.** `vi.mocked()` does not carry `apiFetch<T>`'s
  call-site type argument into the mock's resolved-value parameter, so a missing or misspelled
  field passes `vue-tsc` silently and the component just reads `undefined`. **Anchor the literal:**
  `apiFetch.mockResolvedValue({ … } satisfies CommunityResponse)` costs one word and turns the
  drift into an error on the fixture itself; a typed binding (`const me: MeResponse = { … }`) does
  the same when the fixture is shared. Unanchored literals are the one place a wire-type change
  still has to be found by grep.
- **A prop passed through `<component :is>` is not type-checked.** Vue's `Component` type
  declares its props as `any`, so `vue-tsc` cannot see a missing or misnamed required prop
  crossing that boundary — lint, typecheck and a plain mount all stay green. A test asserting
  the prop actually reached the mounted child is the only guard; see `RoundCard.spec.ts` and
  `lab-page.spec.ts` for the pattern.
- **`expect(w.get(sel).exists()).toBe(true)` asserts nothing.** `get()` already throws when the
  node is missing — VTU types its result as `Omit<DOMWrapper, 'exists'>` for exactly that reason,
  so the call is dead weight and a type error now that specs are checked. Use `find(sel).exists()`
  when presence *is* the claim, `get(sel)` when you go on to use the node.
- **`w.get(sel).element` is an `Element`, so it has no `.style`.** Pass the type argument —
  `w.get<HTMLElement>(sel)`, `w.findAll<HTMLElement>(sel)` — or, where a spec reads several bound
  styles, a local `styleOf(w, sel)` helper keeps the assertions on one line
  (`HueWheelInput.spec.ts`).
- **Never put `expect()` inside a hot loop — check in plain arithmetic and assert once.** An
  assertion costs far more than the code it guards, so a loop that draws N values and asserts on
  each measures the harness, not the subject: in `seededRandom.spec.ts` that was ~1.5 s of pure
  Vitest overhead against ~2 ms of actual work, close enough to the 5 s default timeout to read as
  a flaky test even though the generator is seeded and deterministic. Accumulating the first
  violation and asserting once also gives better diagnostics (it names the draw index).

## happy-dom limits

- **No CSS and no box sizes are computed** — see [frontend-ui.md](frontend-ui.md); layout facts are browser
  measurements, and a spec can only assert the structural proxy.
- **A zero rect does not make pointer geometry untestable — it makes it silently *pass*. Stub the
  rect.** `getBoundingClientRect()` answers all zeroes, so anything derived from it collapses to the
  same value for every input: `HueWheel`'s dead-zone guard (`distance from centre < 0.3 × radius`)
  read `0 < 0` — true everywhere — so *every* pointer path looked correctly suppressed and the whole
  area went untested on the grounds that it "could not be tested". It could: hand the element a box
  and the geometry becomes ordinary arithmetic.
  ```ts
  vi.spyOn(el.element, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
  ```
  What that omission cost: a press on the confirm button in the wheel's centre bubbled to the wheel,
  which captured the pointer and started a drag, so any thumb drift during the 1200 ms hold re-aimed
  the wheel and the *submitted* angle was not the aimed one. Every unit test was green; it took a
  browser to see it. `setPointerCapture` is also absent from happy-dom elements — stub it per test,
  and be explicit about which test the stub is pinning, or the stub becomes what makes the suite pass.
- **A synthetic `PointerEvent` is not a pointer.** `setPointerCapture` throws `NotFoundError` for an
  id the browser is not tracking, and an exception inside a listener does **not** propagate out of
  `dispatchEvent` — so a hand-dispatched drag silently does nothing and reads as "the feature is
  broken". Only the real primary-mouse id tends to work. When driving a live page from the console,
  read the value **in a later call**: Vue flushes the DOM on the next tick, so an attribute read in
  the same turn as the dispatch still shows the old value and will send you chasing a phantom.
- **No Web Animations API**: `Element.prototype.animate` is `undefined` (while `window.matchMedia`
  *does* exist and answers `matches: false` for every query). Any component calling `el.animate(...)`
  must check `typeof el.animate !== 'function'` or the path throws — and note *which* path:
  `FlipDotBoard` animates only inside its watcher, so it's the *update* that throws and a
  mount-only test stays green and hides it. The capability check has to leave the resting appearance
  correct on its own (bind the final colour/position declaratively; let the animation cover only the
  transition). A test that wants to *observe* the animation installs it itself —
  `Object.defineProperty(Element.prototype, 'animate', { value: vi.fn(), configurable: true, writable: true })`,
  deleted again in `afterEach`. `src/ui/flipdot/FlipDotBoard.vue` + its spec are the worked example.
- **Reduced motion** needs a stub, since `matchMedia` always answers `false`:
  `vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)`.
- **VueUse's `onClickOutside` does not fire.** `src/nav/NavDrawer.vue`'s outside-click-to-close
  listens directly instead — `useEventListener(document, 'click', ...)` plus a
  `drawer.value?.contains(e.target as Node) || trigger.value?.contains(e.target as Node)` check.

## Browser-automation pane limits

This is happy-dom's limit in reverse: happy-dom computes no layout, and the browser-automation
pane used for manual review computes no *continuous time* — so neither one can watch an animation
actually play.

- **The pane's page runs with `document.hidden` permanently `true`**, enforced by the renderer
  below the JS-visible flag: overriding `document.hidden`/`document.visibilityState` via
  `Object.defineProperty` changes nothing. A `requestAnimationFrame` loop gets zero callbacks and a
  CSS transition shows zero progress no matter how long real time passes underneath it — the page
  is simply never rendering.
- **A forced screenshot is the one thing that does paint**, and it paints using the true
  wall-clock time elapsed since the previous forced paint. So
  `interaction → screenshot → wait → screenshot` samples an animation at the instants you chose to
  look, even though nothing renders in between.
- **The upshot: animation *feel* is always a human's call**, never something this pane — or a unit
  test — can verify. It's a second, independent reason (besides reduced motion and a hidden tab)
  why a component's resting state must be correct with the animation simply absent, per
  [frontend-ui.md](frontend-ui.md#animation-on-a-phones-main-thread).

## Doubles & lifecycle

- **Under `stubs: { teleport: true }`, grab elements *after* the state change that re-renders the
  teleported slot.** The stub re-renders its content when a reactive value inside it flips, so a
  node captured before the change is a detached copy — and every `Object.defineProperty` stub on it
  (`clientHeight`, `offsetTop`, a mocked rect) is then read past in silence, against the live node's
  happy-dom zeroes. Nothing throws; the assertion simply measures the wrong element and the test
  reports whatever the zero-geometry fallback computes. Cost: `NavDrawer`'s scroll-cue spec stubbed
  a 100/260 overflow before opening the drawer, and the component dutifully answered from a
  `scrollHeight` of 0. `w.get(...).element === captured` is the one-line check when a stubbed
  measurement inexplicably has no effect.
- **A composable double whose value is bound directly in a template must be a real `ref()`, not a
  plain `{ value }` object.** `useAuth()` returns `readonly(ref(...))` and `App.vue` binds it
  directly (`v-if="user"`, `:user="user"` into `NavDrawer`). `<script setup>`'s compiler falls back
  to a runtime `isRef()` check for bindings it can't prove are refs, so a `{ value: … } as never`
  double makes the `v-if` compare an object to nothing and lands the wrapper itself in the prop —
  breaking every read inside the child (`user.avatar`, `v-if="user.isSuperAdmin"`) with no error,
  just wrong output. Build these with `ref(...)` (see `app-header.spec.ts`). The rule doesn't reach
  composables whose value is only ever read via `.value.field` in script and never bound in a
  template — e.g. `useCommunityContext()`'s `community`.
- **Doubles for `router.push`/`replace` need `vi.fn().mockResolvedValue(undefined)`** — production
  code attaches `.catch(...)` to them, and calling `.catch` on a bare `vi.fn()`'s `undefined` throws
  synchronously, failing the test for a reason unrelated to the behavior under test.
- **`enableAutoUnmount(afterEach)` in every spec that mounts a component with module-level state.**
  A wrapper left mounted keeps a live watcher on the module-level ref, so the *next* case's tick
  still reaches it — a component from an earlier case can retry into the current case's spy and
  break a call-count assertion. Per-instance timers hid this, because `vi.useRealTimers()` throws
  the fake-timer registry away and a leaked instance simply stopped ticking. It also fixes the
  ordering: unmount **before** calling a `_reset*State()` hook, since resetting zeroes a refcount
  without unmounting anyone, and a surviving consumer would later release a subscription it no
  longer holds.
- **Fake timers + router guards: use `vi.advanceTimersByTimeAsync`, not `vi.advanceTimersByTime`.**
  Vue Router 5 resolves guards through several internal promise hops, so a guard-armed `setTimeout`
  may not exist yet even after `await Promise.resolve()`. The synchronous form only fires timers
  already registered when it's called and silently advances nothing; the async form drains pending
  microtasks between ticks. See `src/ui/navigationProgress.ts` + its spec.
- **`AbortSignal.timeout`'s internal timer is not driven by `vi.useFakeTimers()`** (it isn't
  scheduled through the fakeable global `setTimeout`), and sleeping on the real 10s makes a test
  slow. Stub the factory instead —
  `vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)` — and call
  `controller.abort()`: drive the signal, not the clock. See `src/api/__tests__/client.spec.ts`.

