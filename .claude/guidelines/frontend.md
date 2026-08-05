# Frontend (webapp-vue)

Conventions for the `webapp-vue/` Vue SPA. **Deliberate goal: keep the set of
moving runtime npm libraries small** (Firebase was the worst offender in the
source app and is gone). The auth/session foundation is the reference
implementation.

## Mobile-first — the audience is phones

**The primary device is a mobile phone.** Design and build for the narrow viewport
first, then widen with breakpoints upward (`sm:`/`md:` add, never `md:`-down to fix a
desktop layout that was written first). Concretely:

- **No hover-only affordances.** Anything discoverable by hovering must also be
  reachable by tap. Hover may enhance, never carry.
- **A horizontally scrolling strip must genuinely scroll.** `overflow-x: auto` on the
  container only helps if the container's own content is never shrunk to fit — a flex
  child needs `shrink-0` (or an equivalent intrinsic width) or its `scrollWidth` stays
  equal to its `clientWidth` and there's nothing to scroll, on touch or otherwise.
  Hiding the scrollbar (`scrollbar-width: none` /
  `&::-webkit-scrollbar { display: none }`) is then a choice, not a default: it costs
  mouse/trackpad users their only affordance, since a strip with no visible scrollbar
  can't be grabbed and dragged — only reach for it once you've confirmed another
  affordance (touch swipe) covers those users.
- **Watch the tap target.** 44px is the floor for anything interactive; the 48px avatar
  circle is deliberately at that scale.
- **A strip that becomes scrollable *late* must reset its own `scrollLeft`.** Firefox keeps a
  scroll container's offset in the session-history entry and restores it on reload — and it applies
  that offset when the element *becomes* a container. `MemberRow` only flips to `overflow-x: auto`
  once the fly-in settles, so on a refresh the row sat at the far left through the whole animation
  and then silently jumped back to the reader's old offset the moment it came to rest (measured in
  Firefox: `scrollLeft` 0 → 281 exactly at the class flip; Chromium does not restore here at all,
  so this reproduces in **Firefox only**). Fix: after the flip, `void nextTick(() => { el.scrollLeft = 0;
  requestAnimationFrame(() => { el.scrollLeft = 0 }) })`. The write also cancels Firefox's *pending*
  restore, and the extra frame is what covers the restore being applied in the reflow that first
  builds the scroll frame — after the `nextTick` microtask. Do the same wherever a strip's scroll
  position is derived from data (a ranking must open on the leader), and reset on **every** settle
  path, `prefers-reduced-motion` included.
- **A percentage width only means what you think inside a parent that has a width.** In a flex
  column with `items-center`, a child is cross-axis **shrink-to-fit**: its width comes from its own
  max-content size, so a `w-[72%]` grandchild resolves against *that*, not against the card. And a
  widthless inline `<svg viewBox="…">` contributes exactly **300px** — the CSS default object width
  for a replaced element with no intrinsic size. Measured in `CountdownCard.vue` before the fix, at
  a 375px viewport and on desktop: card outer 343 / 576, the hero's wrapper **300 / 300**, so the
  hero was **216px on every viewport** while the `w-[94%]` strip below it grew to 307 / 526 — on
  desktop the "hero" was less than half the width of the line beneath it, hierarchy inverted. Two
  fixes, both needed: give the wrapper `w-full` so it stretches instead of shrink-wrapping the svg,
  and drop the card's horizontal padding so a percentage of the content box *is* a percentage of the
  outer width the design names. Afterwards: 343 / **247** / 322 and 576 / **415** / 541. Any future
  SVG-in-a-card hits this, and it is invisible in tests — happy-dom computes no CSS, so a spec can
  only assert the structural proxies (the wrapper carries `w-full`, the card carries no `px-*`) and
  the real check is a browser measurement.
- **Beware `overflow` on animation ancestors.** `overflow-x: auto` computes
  `overflow-y` to `auto` as well, which clips transformed children — so an element that
  both scrolls and hosts an animation that escapes its box must not clip while the
  animation runs.

## Stack

- **Vite 8** (Rolldown-based). Note: build options are `build.rolldownOptions`, not `rollupOptions`.
- **Vue 3**, Composition API, `<script setup lang="ts">`. **pnpm**.
- **TypeScript, very strict**: `strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`; `moduleResolution: "bundler"`. (TypeScript 6 deprecated `baseUrl` used only for path mapping — we keep the `@/*`→`src/*` alias with `"ignoreDeprecations": "6.0"` until a paths-only migration.) **Stay on the `~6.0.x` line — TypeScript 7 breaks `vue-tsc`**; see [dependency-updates.md](dependency-updates.md).
- **Tailwind CSS v4** via `@tailwindcss/vite` (CSS-first: `@import 'tailwindcss';`). No dark-mode lib unless needed.
- **Date/time: Luxon** (`luxon` + `@types/luxon`) — the project's date-time lib (also used by the
  origin huettehuette app). Don't reach for native `Date` math. For a wall-clock UI field use
  `<input type="datetime-local">` (combined date+time picker, naive string, no tz) and convert
  with Luxon **in the relevant IANA zone** (pass `{ zone }`, do NOT rely on the browser zone):
  instant→input `DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm")`,
  input→instant `DateTime.fromISO(local, { zone }).toUTC().toISO()` (returns `string | null` under
  strict TS — guard it). See the **Zone-relative time entry** note below.
- **Icons: Lucide, bundled at build time** — `unplugin-icons` + `@iconify-json/lucide`, both
  **devDependencies**; import as `~icons/lucide/<name>`. Deliberately *not* `@iconify/vue` (the
  origin huettehuette app's choice): its `<Icon>` resolves icon data at runtime from
  `api.iconify.design`, i.e. an external request from every user's browser plus visible pop-in.
  **Gotcha:** `Icons({ compiler: 'vue3', scale: 1 })` must be registered in **both** `vite.config.ts`
  and `vitest.config.ts` — they are separate files, and without it `~icons/*` fails to resolve in
  tests. The explicit `scale: 1` matters too: the plugin defaults to `1.2`, which would silently
  break the "1em, inherits from the surrounding text" contract — with it, generated components
  render exactly `1em`/`currentColor`, so size them purely with Tailwind (`class="size-5"`).
  `vue-tsc` needs `/// <reference types="unplugin-icons/types/vue" />` in `env.d.ts`.

## Routing — Vue Router 5 built-in file-based routing

`unplugin-vue-router` is **archived/absorbed into Vue Router 5 core** — use the built-in:
- `import VueRouter from 'vue-router/vite'` as a Vite plugin, placed **before** `vue()`.
- `import { routes } from 'vue-router/auto-routes'`; pages live in `src/pages/` (`index.vue`, `[id].vue`, …).
- The plugin generates `typed-router.d.ts` (committed; the plugin recommends committing it). Add it to `tsconfig`.
- Per-route meta via the **`definePage({ meta: { ... } })`** macro (compile-time; the call vanishes in the build).
- **`vitest.config.ts` must register the same `VueRouter()` plugin as `vite.config.ts`, before `vue()`.** Without it, `vue-router/auto-routes` can't be resolved in tests at all, `definePage` never reaches the compiled component (its `meta` is unreachable from a mount), and — the bigger risk — no test can ever exercise the *real*, generated route table: every router-based test would have to hand-roll its own small `routes` array, which cannot catch a route-ranking regression (e.g. a catch-all shadowing a real page). Registering the plugin fixes all of that at once and needs no `definePage` stub in `src/test-setup.ts` — delete it if you find one; it's dead once the plugin is registered. A test asserting the generated table's ranking (real paths resolve to their own route, an unmatched path falls through to the catch-all) belongs in `src/__tests__/` since it's a whole-router concern, not one page's.
- **Typed route params (strict TS):** Use the typed `useRoute('/c/[slug]')` overload (the route name string from `typed-router.d.ts`) rather than plain `useRoute()`. Plain `useRoute()` returns a union of all routes; accessing `.params.slug` on it fails under `strict` + vue-tsc. Dynamic-segment pages (`c/[slug].vue`, `c/[slug]/members.vue`, etc.) all need the specific route name — though in practice no community page needs this any more, since they read `useCommunityContext()` instead. See also [multi-tenancy.md](multi-tenancy.md).
- **Gotcha:** `router.push()` / `.replace()` return a Promise; a bare, unawaited call at the end of
  an async handler leaves its rejection on a chain nothing observes. `CommunityMenu.vue` and
  `MemberMenu.vue` attach `.catch((e) => console.error('navigation failed', e))` to every
  post-action navigation. Test doubles for `push`/`replace` must resolve accordingly —
  `vi.fn().mockResolvedValue(undefined)` — a bare `vi.fn()` returns `undefined`, and calling
  `.catch` on that throws synchronously, failing the test for a reason unrelated to the behavior
  under test.

### Navigation data: resolve in `beforeResolve`, publish in `afterEach`

Route-derived app state (the active community, the `/` landing target) is owned by router guards,
not component lifecycle hooks — `src/communities/routeData.ts` and
`src/communities/landingGuard.ts` are the reference implementation.

- **Fetch in `beforeResolve`, write in `afterEach`.** Writing during `beforeResolve` lets an aborted
  navigation leave state describing a route the user never reached; writing in `afterEach` makes
  the header match the committed route by construction.
- **`afterEach` fires for failed navigations too, and receives the `failure` argument — check it.**
  Skipping failures is what turns a redirect back to the route we're already on into a true no-op.
- **A direct duplicate push and a guard-produced duplicate both reach `afterEach` with a
  `duplicated` `NavigationFailure` (type 16) — that part is not what distinguishes them.** Measured:
  `router.push('/x')` while already on `/x` fires zero `beforeEach`/`beforeResolve` guards at all,
  yet `afterEach` still runs with the failure. The real difference is that one: a guard-produced
  redirect to the route already in effect (e.g. the landing guard resolving `/` back to the
  community you're already on) *does* run `beforeResolve`, so it is the only one of the two that
  exercises the landing guard. The whole flicker fix depends on that case, so a test that only
  exercises the direct push proves nothing about it.
- **`push()` / `.replace()` resolve with a `NavigationFailure` for aborted/cancelled navigations —
  they only reject when a guard throws.** A `.catch()` on a navigation therefore does not tell you
  the navigation succeeded; inspect the resolved value instead. Code that flips UI state only in a
  `.catch` path will silently mishandle an aborted navigation.
- **Never clear app-global route state from `onUnmounted`.** A component teardown hook fires on the
  way out of a route, with no knowledge of what the destination needs — so it clears state the
  incoming route may already depend on, and it clears it a full round-trip before that route can
  restore it (the incoming component's own fetch is async). Ownership belongs to the router, which
  sees both ends of the transition.
- **`router.isReady()` only settles once the initial navigation has run, and `router.install()` is
  what starts that navigation.** Awaiting `isReady()` before `app.use(router)` deadlocks. Order:
  `createApp(App).use(router)` → `await router.isReady()` → `app.mount()`.
- **Guard async loads with a generation counter** so a superseded navigation cannot publish its
  result — the same technique `useCountdown` uses for stale responses.
- **A pending indicator needs a delay (~150 ms, `PENDING_DELAY_MS`).** An indicator that flashes on
  a fast transition is itself the flicker it was added to explain. See the fake-timer note under
  Testing below for how to drive this in a guard-based test.

## State — composables + VueUse (no Pinia)

App-global state (e.g. the session) is a module-level singleton: module-scope `ref`s, typically exposed `readonly()` from a composable, mutated only through the composable's functions. Rationale: minimal moving libs; add Pinia later only if state genuinely outgrows this. For unit tests, expose a small `_reset*State()` hook — colocated in the composable's own module, e.g. `_resetAuthState()` in `useAuth.ts`, `_resetCommunitiesState()` in `useCommunities.ts` — to reset the singleton between cases (module state is per-file, not per-test, in Vitest; a previous test's successful load otherwise leaks into the next). Reset by assigning the module-scope ref from inside that hook, not by reaching into the object the composable returns: the latter only compiles as long as the returned ref happens not to be wrapped `readonly()`.

**Ambient time is shared state; the domain around it is not.** `useCountdown` is instantiated twice on
a community page (the header widget and the fallback card), and two `setInterval`s started at
different moments never resynchronise — the two displays showed seconds up to a full tick apart at
the same instant. So `nowMs` and `skewMs` (the *server's* clock correction, of which there is exactly
one) live at module scope behind **one** interval, while everything domain-shaped — `round`, the
click-cycleable base unit, the load/retry bookkeeping — stays per instance and reacts to the shared
clock via `watch(nowMs, tick)`. Two consequences worth remembering:

- **Refcount the interval**: start it when the first consumer subscribes, clear it when the last
  unsubscribes. Clearing on the first `onUnmounted` stops the surviving consumer's clock; never
  clearing leaks an interval on every route change. The `_reset*State()` hook must reset the
  refcount *and* clear the interval, or the next test case mounts with a stale count and gets no
  clock at all.
- **A shared clock makes mount/unmount hygiene mandatory in specs.** A wrapper left mounted keeps a
  live watcher on the module-level `ref`, so the *next* test case's tick still reaches it — a
  component from an earlier case, whose load had failed, retried into the current case's spy and
  broke a call-count assertion. `enableAutoUnmount(afterEach)` (already used in `HeaderMenu.spec.ts`)
  in every spec that mounts such a component. Per-instance timers hid this: the fake-timer registry
  is thrown away by `vi.useRealTimers()`, so a leaked instance simply stopped ticking. Unmount before
  calling the reset hook, not after — resetting zeroes the refcount without unmounting anyone, so a
  surviving consumer would later release a subscription it no longer holds and clear an interval a
  newer one started. `enableAutoUnmount(afterEach)` is what guarantees that ordering.
- **A shared clock trades freshness for agreement — don't "fix" it back.** A consumer mounting between
  ticks inherits the last tick's `nowMs`, so its first paint can be up to a second stale. That is the
  point: two displays of the same instant agreeing matters more than either being maximally current,
  and re-anchoring the clock on mount reintroduces exactly the drift the singleton removed (measured:
  header and card showed seconds a full tick apart while claiming the same instant). Where a stale
  first paint would actually be visible, cover it — `FlipDotBoard`'s 400 ms switch-on sequence hides
  it by construction.

## HTTP + auth (the same-origin SPA contract)

The backend (`iam`) serves a same-origin SPA contract: session cookie, `401` (not redirect) for unauthenticated API, cookie CSRF (`XSRF-TOKEN` → `X-XSRF-TOKEN`).

- **`apiFetch`** (`src/api/client.ts`) wraps native **fetch**: `credentials: 'include'`; adds `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie on **mutating** methods only; JSON-only (body typed `string | null`); throws a typed `ApiError(status, message, body?)` on non-2xx **and on a non-JSON 200** (catches proxy/error pages); on `401` invokes a globally-registered handler then throws. The 401 handler is injected via `setUnauthorizedHandler(...)` to decouple the client from the router/auth (avoids a circular import).
- **`apiFetch` request timeout:** every call gets a 10s `AbortSignal.timeout(...)` (chosen to tolerate normal latency/cold single-instance backend while still bounding a stuck navigation guard or `bootstrap()` to a UX-relevant time) so a *hung* request (vs. a failed one) can't hang a caller forever. A caller-supplied `signal` is composed in via `AbortSignal.any([...])` rather than replaced — both `.timeout` and `.any` are Baseline-widely-available and safe given this project targets only evergreen browsers. A timeout surfaces as `ApiError(0, ...)` (status `0` = no HTTP response was ever received, the same convention `XMLHttpRequest.status` uses for network-level failures — `504` would wrongly imply a server responded). A caller's own abort is deliberately **not** wrapped into `ApiError`: it rethrows the native `AbortError` as-is, checked via `options.signal?.aborted` before the timeout check, so a deliberate cancel is never misreported as a server timeout.
  - **Testing gotcha:** `AbortSignal.timeout`'s internal timer is not driven by `vi.useFakeTimers()`/`advanceTimersByTimeAsync` (it isn't scheduled through the fakeable global `setTimeout`), and sleeping on the real 10s makes a test slow/flaky. Instead stub `AbortSignal.timeout` itself (`vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)`) and call `controller.abort()` directly — drive the signal, not the clock. See `src/api/__tests__/client.spec.ts`.
- **`useAuth`** (`src/auth/useAuth.ts`): eager `bootstrap()` (`GET /api/me`) resolves the session **before the app mounts** (so the guard never sees `'unknown'`); `loginWithGitHub()` does a **full-page navigation** `window.location.assign('/oauth2/authorization/github')` (OAuth needs a real navigation, not fetch); `logout()` POSTs `/logout` then resets — it intentionally does NOT reset local state if the server call fails (session may still be alive).
- **Route guard** (`src/auth/guard.ts`): **fail-closed** — only `status === 'authenticated'` may enter a non-public route; everything else redirects to `/login`. Routes are auth-required unless they set `meta.public = true`. The redirect target `/login` **must** be `meta.public` or anonymous users loop.
- **Dev proxy:** Vite `server.proxy` forwards `/api`, `/oauth2`, `/login/`, `/logout` to the backend (prefixes live in `webapp-vue/dev-proxy.ts`, target `VITE_API_PROXY_TARGET`, default `http://localhost:8080`) so same-origin holds locally.
  - **A string proxy key is a plain prefix** (`url.startsWith(key)`) — so **`/login/` needs its trailing slash**: `/login` itself is the SPA's sign-in *page*, only its sub-paths (`/login/github`, `/login/oauth2/code/*`) are backend. Without the slash, a direct load of `http://localhost:5173/login` is proxied away and never reaches the router (prod is unaffected — the edge already scopes it to `path /login/*`, see `deploy/Caddyfile`). Keep dev and the edge in sync; `src/__tests__/dev-proxy.spec.ts` guards the split.
  - **Use `changeOrigin: false`** (transparent proxy): the backend must see the browser's `Host` (`localhost:5173`) so it builds OAuth2 `redirect_uri` + post-login redirects on the SPA origin. With `changeOrigin: true` the backend sees `:8080`, GitHub redirects the browser to `:8080`, and the user lands on the backend (raw JSON / `/error`) instead of the SPA after login. The **GitHub OAuth App callback must be the SPA origin** in dev: `http://localhost:5173/login/oauth2/code/github`.
- **UX:** surface API failures to the user; never leave a promise rejection unhandled in a click handler; log bootstrap failures rather than swallowing them.

## Testing

- **Vitest + @vue/test-utils + happy-dom**, unit level. JUnit-style; kotest is NOT used here.
- **Mocking uses Vitest `vi`** (`vi.stubGlobal` for `fetch`/`location`, `vi.mock` for modules) — **NOT mockk/kotest** (those are the Kotlin backend's convention).
- Test **real behavior**, not mock echoes: assert on the actual `RequestInit` sent to `fetch`, on `router.currentRoute` after navigation (guard tests use a `createMemoryHistory` router), etc.
- **VueUse's `onClickOutside` does not fire under happy-dom.** `src/ui/HeaderMenu.vue`'s
  outside-click-to-close listens directly instead — `useEventListener(document, 'click', ...)` plus
  a `root.value?.contains(e.target as Node)` check — because a test built against `onClickOutside`
  cannot pass under Vitest/happy-dom.
- **Fake timers + router guards: use `vi.advanceTimersByTimeAsync`, not `vi.advanceTimersByTime`.**
  Vue Router 5 resolves `beforeEach`/`beforeResolve` guards through several internal promise hops
  (data-loader effect-scope plumbing), so a guard-armed `setTimeout` may not exist yet even after
  `await Promise.resolve()`. The synchronous `vi.advanceTimersByTime(ms)` only fires timers that are
  *already* registered at the moment it's called — if the guard hasn't run yet, it silently advances
  nothing. `await vi.advanceTimersByTimeAsync(ms)` drains pending microtasks between ticks of the
  fake clock, giving the guard a chance to actually register the timer before the clock moves past
  it. See `src/ui/navigationProgress.ts` + its spec for the worked example.
- **A composable double whose value is bound directly in a template must be a real `ref()`, not a
  plain `{ value }` object.** `useAuth()` returns `readonly(ref(...))`, and both `MemberMenu.vue`
  (`{{ user?.username }}`) and `App.vue` (`v-if="status === 'authenticated'"`) bind it directly. A
  plain `{ value: ... } as never` double isn't a ref; `<script setup>`'s template compiler falls
  back to a runtime `isRef()` check for bindings it can't prove are refs at compile time, so the
  interpolation quietly renders empty and the `v-if` quietly compares an object to a string — no
  error, just wrong output. Build these doubles with `ref(...)` (see `MemberMenu.spec.ts`,
  `app-header.spec.ts`). The rule doesn't reach composables whose value is only ever read via
  `.value.field` in script and never bound in a template — e.g. `useCommunityContext()`'s
  `community`, or `useCommunities()`'s plain-object double in `index.spec.ts`.
- **A fixture handed to `vi.mocked(apiFetch).mockResolvedValue(...)` is not type-checked.**
  `vi.mocked()` does not carry `apiFetch<T>`'s call-site type argument into the mock's
  resolved-value parameter, so a missing or misspelled field in the fixture passes `vue-tsc`
  silently and the component just reads `undefined`. Such fixtures have to be correct by
  construction — copy the shape from `src/api/types.ts`, and prefer a typed helper
  (`const me: MeResponse = { … }`) when you want the compiler's help at all.
- **`trigger('click')` is swallowed on a `disabled` element, so "clicking it does nothing" proves
  nothing.** `DOMWrapper.trigger` (VTU 2.4) short-circuits on a disabled element and never
  dispatches, so `await btn.trigger('click'); expect(spy).not.toHaveBeenCalled()` passes purely
  because of the attribute — measured: removing the handler-level guard
  (`if (locked.value) return` in `super-admin/users/[id].vue`) leaves that spec green. Assert
  `attributes('disabled')` for what you actually mean (the affordance), and be aware that a
  handler-level guard behind a disabled button is **not** covered by such a test; to exercise it,
  drive the handler from a state where the button is enabled.
- **happy-dom has no Web Animations API.** Measured on happy-dom 20.11:
  `typeof Element.prototype.animate === 'undefined'` (while `window.matchMedia` *does* exist and
  reports `matches: false` for every query). So any component that calls `el.animate(...)` must
  check the capability — `typeof el.animate !== 'function'` — or **any code path that reaches
  `el.animate(...)` throws** in tests. Note which path that is: `FlipDotBoard` animates only inside
  its watcher, so it is the *update* that throws, not the mount — a mount-only test stays green and
  hides it. The check has to leave the resting appearance correct on its own (bind the final colour/position
  declaratively; let the animation only cover the transition). A test that wants to *observe* the
  animation installs it itself:
  `Object.defineProperty(Element.prototype, 'animate', { value: vi.fn(), configurable: true, writable: true })`
  and deletes it again in `afterEach`. `src/ui/flipdot/FlipDotBoard.vue` + its spec are the worked
  example.
- **Reduced motion in tests:** `vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)`
  — happy-dom's own `matchMedia` always answers `false`, so the reduced-motion branch is unreachable
  without the stub.

## Community context + admin gating

Pages nested under `c/[slug]/` receive the loaded community via Vue's `provide`/`inject`, keyed on `communityKey` from `src/communities/context.ts`.

- The shell (`src/pages/c/[slug].vue`) renders `communityRoute` from `src/communities/routeData.ts` — a module-level ref that the `registerCommunityDataGuard` router guard **resolves in `beforeResolve`, before the route commits, and publishes in `afterEach`, once it has committed** — so the shell does no fetching of its own to decide what to render. It provides `{ community: Readonly<Ref<CommunityResponse>>, refresh }` and renders `<RouterView />` only in the `state?.kind === 'ready'` branch — so children can safely read `community.value` as non-null. `refresh()` is a separate, explicitly-triggered fetch (see below) — the guard only owns the *initial* resolve.
- The type mismatch (`Ref<CommunityResponse | null>` vs `Readonly<Ref<CommunityResponse>>`) is bridged with `community as unknown as Readonly<Ref<CommunityResponse>>`. This is intentional: the null case is excluded structurally (children only mount after ready), and `unknown` is necessary because TypeScript cannot widen through a `Readonly` wrapper.
- Child pages call `useCommunityContext()` (throws if context is missing) instead of `useRoute()` — they never need to re-fetch the slug from the router.
- `useAdminGuard()` (in `src/communities/useAdminGuard.ts`) redirects to `communityPath(slug)` on `onMounted` if `viewerIsAdmin` is false. This is a UX guard only — the backend `@RequireAdmin` annotation is the real gate.
- Admin-only pages (`members.vue`, `settings.vue`, `requests.vue`) all call `useAdminGuard()` at the top of `<script setup>`.
- In tests, mock the entire context module: `vi.mock('@/communities/context', () => ({ useCommunityContext: () => ({ community: { value: { ...fields } }, refresh: vi.fn() }) }))`. This avoids the `inject` dependency on a real Vue app wrapping.
- `CommunityResponse` includes `viewerIsAdmin: boolean` and `pendingCount: number` returned by the backend; both are republished into `activeCommunity` for the header's community menu (see "App-level header state" below) rather than consumed inside the shell itself.
- `refresh()` deliberately keeps no internal `try`/`catch` — a rejection is the caller's to handle, not something it swallows. It is handed to every `[slug]` child through `provide(communityKey, …)`, so this contract binds every child, not just the shell: wrap the call in your own `try`/`catch`, and don't treat the action as having succeeded until `refresh()` itself has resolved. `requests.vue` and `settings.vue` both fold their `await refresh()` into the same `try` as the mutating call, so a rejection there still lands in the `catch` instead of being reported as a silent success.

## Lint / format

- **ESLint flat config** in `eslint.config.mjs` (ESLint 10 needs an extra flag to load a `.ts` config, so use `.mjs`) + **Prettier**.
- Disable `vue/multi-word-component-names` for `src/pages/**` — file-based route components are idiomatically single-word (`index.vue`, `login.vue`).
- **Tailwind v4 scans source text, so a class name must appear literally.** A computed
  `` `w-[${pct}%]` `` is never generated — no rule ends up in the CSS and the element simply has no
  width. Where a value varies, map it to literal class strings
  (`if (n <= 2) return 'w-[72%]'`), as `communities/fallbacks/CountdownCard.vue` does for the
  hero width.

## Typecheck must be `vue-tsc -b` — `--noEmit` checks nothing here

`tsconfig.json` is a **solution file**: `"files": []` plus project references. `vue-tsc --noEmit` on
it therefore type-checks **zero files** and always exits 0. The `typecheck` script used to be exactly
that, so the CI gate in `build-web.yml` — added specifically so type errors surface on a PR instead of
after merge — passed vacuously, and a broken build only showed up in the image build. Use
**`vue-tsc -b`** (build mode walks the references; ~1000 files). If you ever change the script, verify
it with a deliberate type error rather than trusting a green run.

Three projects, deliberately:

| Project | Checks | Why separate |
|---|---|---|
| `tsconfig.app.json` | `src/**` **minus** tests | App code must NOT get `@types/node` — `process.env` would typecheck and then fail in the browser |
| `tsconfig.vitest.json` | `src/**/__tests__/**` | Tests run in Node and legitimately use `node:fs` (e.g. reading `shared/rng/golden-vectors.json`) |
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs` | Config files are Node, not browser |

A test importing `node:fs` while tests were still inside the app project is what surfaced this.

## Server-authoritative ticking values (countdown pattern)

For live values that must agree with the backend (the countdown), the backend owns the logic and
emits **absolute instants** (`GET /api/communities/{slug}/countdown` -> current + next `Round` with
`start`/`end` instants + `serverNow`). The SPA never re-derives the rounds — it ticks a local
1 s clock, corrects skew once (`serverNow - Date.now()`), and only **subtracts + formats**
(`src/communities/countdown.ts` is a pure projection; `useCountdown` wires the clock/fetch around
it). At a round boundary it shifts to the pre-fetched `nextRound`, then refetches (~once/day). No
KT/TS parity test is needed because no logic is duplicated. Decompose: pure functions (testable
without mounting, like `resolveLanding`) + a thin composable + a thin component. Guard async loads
with a generation counter (stale-response) and a try/catch (a failed fetch degrades the widget to
hidden, never an unhandled rejection).

**`state: 'idle'` conflates "not loaded yet" with "load failed" — every consumer must decide what
that means for its own surface.** `computeView` returns `'idle'` whenever `round` is null, and a
swallowed fetch error leaves `round` null, so the two are indistinguishable downstream. And the
boundary-driven refetch cannot recover from it: `boundaryAction(null, …)` answers `'none'`, so a
failed *first* load used to mean the composable never fetched again for the lifetime of the mount.
The two consumers read the same `'idle'` very differently — `CountdownDisplay` (header) renders
nothing, which is a fine degradation, while `RoundFallback`'s card is the page's most prominent slot
and showed a permanently blank square. `tick()` therefore retries every `FAILED_LOAD_RETRY_MS`
(10 s) until a load has succeeded, gated on an explicit "loaded" flag rather than on `round === null`
— the backend legitimately answers `round: null` for a community without a `startsAt`, and polling
that would be a request every 10 s per open page for nothing.

**App-level header state:** `App.vue` sits above the `[slug]` provider tree, so state it needs from
the active community (title, `startsAt`, `startsAtTimezone`) is published via a module-level ref
`activeCommunity` in `src/communities/context.ts` — not via `provide`/`inject`. `publishCommunity()`
is the single path that *publishes* a loaded community: `registerCommunityDataGuard`'s `afterEach`
(`src/communities/routeData.ts`) calls it once the community is fetched, and the shell's `refresh()`
calls it again on every explicit reload. Clearing is separate and is the guard's own business —
`afterEach` sets `activeCommunity` (and `communityRoute`) to `null` directly when the destination
route carries no slug, rather than going through the helper. `ActiveCommunity` also carries
`viewerIsAdmin` + `pendingCount` for the header's community menu. **Every path that loads the
community must republish it** — that's why both the guard and `refresh()` funnel through
`publishCommunity()` instead of writing `activeCommunity` directly. Publishing only on the initial
resolve leaves stale header state behind (the pending dot would survive an admin clearing the
requests). Navigation controls live in the main header (`CommunityMenu`, `MemberMenu` on top of the
shared `src/ui/HeaderMenu.vue`), never inside the `[slug]` content area.

**Zone-relative time entry:** a `datetime-local` value is a naive wall-clock string; interpret it in
the community's `startsAtTimezone`, not the browser zone — `DateTime.fromISO(local, { zone }).toUTC()`
to store, `DateTime.fromISO(iso, { zone }).toFormat(...)` to display. Test zone-correctness with a
fixture whose zone year/day differs from UTC. Luxon's fallback when `{ zone }` is dropped is the
**system** zone, not UTC — `vitest.config.ts` pins `env: { TZ: 'UTC' }` so that fallback is the same
locally as on CI (whose runner already defaults to UTC) and a dropped `{ zone }` reliably turns the
test red either way. Still choose the fixture's own zone far from UTC, not merely different from
your machine's: the community overview page's `Pacific/Kiritimati` (UTC+14) is the worked example
and stays discriminating under any plausible host zone, whereas a fixture formatted in
`Europe/Berlin` would not.

## Role-gated areas + shell-owned access checks

The super-admin area (`/super-admin`) is undiscoverable rather than unlinked: the only entry
point is a `MemberMenu` item rendered under `v-if="user?.isSuperAdmin"`, so a viewer without the
role sees no trace of it. Gate any such entry point on the role itself — never on a plain link
that a non-holder can see and bounce off.
Pattern, mirroring the `c/[slug].vue` shell:

- `src/pages/super-admin.vue` is a **layout** for `src/pages/super-admin/*.vue`. No router config is
  needed, and no slug needs reserving: communities live under `/c/`, so the root namespace is free
  for pages (see [multi-tenancy.md](multi-tenancy.md)).
- The shell does the role check **once** and keeps `<RouterView/>` inside the authorised branch.
  Children then contain no access logic and, more importantly, never mount for an unauthorised
  viewer — so they never fire a request that would 403. The backend rule is the real gate.
- No `meta` flag and no change to `guard.ts` is needed for this; adding one would only duplicate
  what the shell already enforces.

**Test trap — `useAuth` stubs must be real refs.** A component template that reads
`user?.isSuperAdmin` relies on Vue unwrapping the ref. The older stub style
`user: { value: null } as never` is a plain object, so unwrapping silently yields `undefined` and
a positive-path assertion can never pass. Return `ref({ … }) as never` from the mocked `useAuth`.
