# Frontend — testing (webapp-vue)

Vitest + @vue/test-utils + happy-dom. Siblings: [frontend.md](frontend.md)
(stack, HTTP, tooling), [frontend-ui.md](frontend-ui.md),
[frontend-routing.md](frontend-routing.md), [frontend-state.md](frontend-state.md).

## Setup

- **Vitest + @vue/test-utils + happy-dom**, unit level. JUnit-style; kotest is NOT used here.
- **Mocking uses Vitest `vi`** (`vi.stubGlobal` for `fetch`/`location`, `vi.mock` for modules) — **NOT mockk/kotest** (those are the Kotlin backend's convention).
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
- **A fixture handed to `vi.mocked(apiFetch).mockResolvedValue(...)` is not type-checked.**
  `vi.mocked()` does not carry `apiFetch<T>`'s call-site type argument into the mock's
  resolved-value parameter, so a missing or misspelled field passes `vue-tsc` silently and the
  component just reads `undefined`. Copy the shape from `src/api/types.ts`, and prefer a typed
  helper (`const me: MeResponse = { … }`) when you want the compiler's help.
- **Never put `expect()` inside a hot loop — check in plain arithmetic and assert once.** An
  assertion costs far more than the code it guards, so a loop that draws N values and asserts on
  each measures the harness, not the subject: in `seededRandom.spec.ts` that was ~1.5 s of pure
  Vitest overhead against ~2 ms of actual work, close enough to the 5 s default timeout to read as
  a flaky test even though the generator is seeded and deterministic. Accumulating the first
  violation and asserting once also gives better diagnostics (it names the draw index).

## happy-dom limits

- **No CSS and no box sizes are computed** — see [frontend-ui.md](frontend-ui.md); layout facts are browser
  measurements, and a spec can only assert the structural proxy.
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

## Doubles & lifecycle

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

