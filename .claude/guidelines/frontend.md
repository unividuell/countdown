# Frontend (webapp-vue)

Conventions for the `webapp-vue/` Vue SPA. **Deliberate goal: keep the set of
moving runtime npm libraries small** (Firebase was the worst offender in the
source app and is gone). The auth/session foundation is the reference
implementation.

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
- **Gotcha:** `definePage` is a build-time macro processed by the VueRouter plugin. Unit tests run Vitest with only `@vitejs/plugin-vue` (not the VueRouter plugin), so stub it in a setup file: `globalThis.definePage = (r) => r` (mirrors `vue-router/experimental`'s runtime no-op).
- **Typed route params (strict TS):** Use the typed `useRoute('/[slug]')` overload (the route name string from `typed-router.d.ts`) rather than plain `useRoute()`. Plain `useRoute()` returns a union of all routes; accessing `.params.slug` on it fails under `strict` + vue-tsc. Dynamic-segment pages (`[slug].vue`, `[slug]/members.vue`, etc.) all need the specific route name. See also `multi-tenancy.md`.
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
- **A direct duplicate push and a guard-produced duplicate are not the same thing.**
  `router.push('/x')` while already on `/x` short-circuits — no guard runs at all. But a guard that
  *returns* a redirect to the route already in effect (e.g. the landing guard resolving `/` back to
  the community you're already on) runs the navigation through `afterEach` with a `duplicated`
  `NavigationFailure`. The whole flicker fix depends on the second case, so a test that only
  exercises the first proves nothing about it.
- **`push()` / `.replace()` resolve with a `NavigationFailure` for aborted/cancelled navigations —
  they only reject when a guard throws.** A `.catch()` on a navigation therefore does not tell you
  the navigation succeeded; inspect the resolved value instead. Code that flips UI state only in a
  `.catch` path will silently mishandle an aborted navigation.
- **Never clear app-global route state from `onUnmounted`.** Vue mounts the incoming component
  before unmounting the outgoing one, so the departing component's hook runs *last* and would
  overwrite the value the new route just wrote. Ownership belongs to the router, not to a component
  lifecycle.
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

## HTTP + auth (the same-origin SPA contract)

The backend (`iam`) serves a same-origin SPA contract: session cookie, `401` (not redirect) for unauthenticated API, cookie CSRF (`XSRF-TOKEN` → `X-XSRF-TOKEN`).

- **`apiFetch`** (`src/api/client.ts`) wraps native **fetch**: `credentials: 'include'`; adds `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie on **mutating** methods only; JSON-only (body typed `string | null`); throws a typed `ApiError(status, message, body?)` on non-2xx **and on a non-JSON 200** (catches proxy/error pages); on `401` invokes a globally-registered handler then throws. The 401 handler is injected via `setUnauthorizedHandler(...)` to decouple the client from the router/auth (avoids a circular import).
- **`useAuth`** (`src/auth/useAuth.ts`): eager `bootstrap()` (`GET /api/me`) resolves the session **before the app mounts** (so the guard never sees `'unknown'`); `loginWithGitHub()` does a **full-page navigation** `window.location.assign('/oauth2/authorization/github')` (OAuth needs a real navigation, not fetch); `logout()` POSTs `/logout` then resets — it intentionally does NOT reset local state if the server call fails (session may still be alive).
- **Route guard** (`src/auth/guard.ts`): **fail-closed** — only `status === 'authenticated'` may enter a non-public route; everything else redirects to `/login`. Routes are auth-required unless they set `meta.public = true`. The redirect target `/login` **must** be `meta.public` or anonymous users loop.
- **Dev proxy:** Vite `server.proxy` forwards `/api`, `/oauth2`, `/login`, `/logout` to the backend (`VITE_API_PROXY_TARGET`, default `http://localhost:8080`) so same-origin holds locally. **Use `changeOrigin: false`** (transparent proxy): the backend must see the browser's `Host` (`localhost:5173`) so it builds OAuth2 `redirect_uri` + post-login redirects on the SPA origin. With `changeOrigin: true` the backend sees `:8080`, GitHub redirects the browser to `:8080`, and the user lands on the backend (raw JSON / `/error`) instead of the SPA after login. The **GitHub OAuth App callback must be the SPA origin** in dev: `http://localhost:5173/login/oauth2/code/github`.
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

## Community context + admin gating

Pages nested under `[slug]/` receive the loaded community via Vue's `provide`/`inject`, keyed on `communityKey` from `src/communities/context.ts`.

- The shell (`src/pages/[slug].vue`) renders `communityRoute` from `src/communities/routeData.ts` — a module-level ref that the `registerCommunityDataGuard` router guard resolves (in `beforeResolve`) and publishes (in `afterEach`) before the route ever commits, so the shell itself does no fetching. It provides `{ community: Readonly<Ref<CommunityResponse>>, refresh }` and renders `<RouterView />` only in the `state === 'ready'` branch — so children can safely read `community.value` as non-null.
- The type mismatch (`Ref<CommunityResponse | null>` vs `Readonly<Ref<CommunityResponse>>`) is bridged with `community as unknown as Readonly<Ref<CommunityResponse>>`. This is intentional: the null case is excluded structurally (children only mount after ready), and `unknown` is necessary because TypeScript cannot widen through a `Readonly` wrapper.
- Child pages call `useCommunityContext()` (throws if context is missing) instead of `useRoute()` — they never need to re-fetch the slug from the router.
- `useAdminGuard()` (in `src/communities/useAdminGuard.ts`) redirects to `/${slug}/` on `onMounted` if `viewerIsAdmin` is false. This is a UX guard only — the backend `@RequireAdmin` annotation is the real gate.
- Admin-only pages (`members.vue`, `settings.vue`, `requests.vue`) all call `useAdminGuard()` at the top of `<script setup>`.
- In tests, mock the entire context module: `vi.mock('@/communities/context', () => ({ useCommunityContext: () => ({ community: { value: { ...fields } }, refresh: vi.fn() }) }))`. This avoids the `inject` dependency on a real Vue app wrapping.
- `CommunityResponse` includes `viewerIsAdmin: boolean` and `pendingCount: number` returned by the backend; both are republished into `activeCommunity` for the header's community menu (see "App-level header state" below) rather than consumed inside the shell itself.
- `refresh()` deliberately keeps no internal `try`/`catch` — a rejection is the caller's to handle, not something it swallows. It is handed to every `[slug]` child through `provide(communityKey, …)`, so this contract binds every child, not just the shell: wrap the call in your own `try`/`catch`, and don't treat the action as having succeeded until `refresh()` itself has resolved. `requests.vue` and `settings.vue` both fold their `await refresh()` into the same `try` as the mutating call, so a rejection there still lands in the `catch` instead of being reported as a silent success.

## Lint / format

- **ESLint flat config** in `eslint.config.mjs` (ESLint 10 needs an extra flag to load a `.ts` config, so use `.mjs`) + **Prettier**.
- Disable `vue/multi-word-component-names` for `src/pages/**` — file-based route components are idiomatically single-word (`index.vue`, `login.vue`).

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

**App-level header state:** `App.vue` sits above the `[slug]` provider tree, so state it needs from
the active community (title, `startsAt`, `startsAtTimezone`) is published via a module-level ref
`activeCommunity` in `src/communities/context.ts` — written by `registerCommunityDataGuard`'s
`afterEach` (`src/communities/routeData.ts`) and by the shell's `refresh()`, both through the single
`publishCommunity()` helper, not via `provide`/`inject`. `ActiveCommunity` also carries
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
Pattern, mirroring the `[slug].vue` shell:

- `src/pages/super-admin.vue` is a **layout** for `src/pages/super-admin/*.vue`. A static route
  segment outranks the dynamic `/:slug`, so no router config is needed — but reserve the segment
  in the backend's `Slugs.RESERVED`, or a community with that slug becomes unreachable.
- The shell does the role check **once** and keeps `<RouterView/>` inside the authorised branch.
  Children then contain no access logic and, more importantly, never mount for an unauthorised
  viewer — so they never fire a request that would 403. The backend rule is the real gate.
- No `meta` flag and no change to `guard.ts` is needed for this; adding one would only duplicate
  what the shell already enforces.

**Test trap — `useAuth` stubs must be real refs.** A component template that reads
`user?.isSuperAdmin` relies on Vue unwrapping the ref. The older stub style
`user: { value: null } as never` is a plain object, so unwrapping silently yields `undefined` and
a positive-path assertion can never pass. Return `ref({ … }) as never` from the mocked `useAuth`.
