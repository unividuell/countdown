# Frontend — routing, shells & access (webapp-vue)

Route definition, guard-owned navigation data, the `[slug]` community shell and
role-gated areas. Siblings: [frontend.md](frontend.md) (stack, HTTP, tooling),
[frontend-ui.md](frontend-ui.md), [frontend-state.md](frontend-state.md),
[frontend-testing.md](frontend-testing.md).

## Routing — Vue Router 5 built-in file-based routing

`unplugin-vue-router` is **archived/absorbed into Vue Router 5 core** — use the built-in:
- `import VueRouter from 'vue-router/vite'` as a Vite plugin, placed **before** `vue()`.
- `import { routes } from 'vue-router/auto-routes'`; pages live in `src/pages/` (`index.vue`, `[id].vue`, …).
- The plugin generates `typed-router.d.ts` (committed; the plugin recommends committing it). Add it to `tsconfig`.
- Per-route meta via the **`definePage({ meta: { ... } })`** macro (compile-time; the call vanishes in the build).
- The plugin must be registered in `vitest.config.ts` too — see [frontend-testing.md](frontend-testing.md) § Setup; without it no test
  can exercise the real generated route table, so no test can catch a route-ranking regression
  (e.g. a catch-all shadowing a real page). Such a ranking test belongs in `src/__tests__/`, since
  it is a whole-router concern rather than one page's.
- **Typed route params (strict TS):** Use the typed `useRoute('/c/[slug]')` overload (the route name string from `typed-router.d.ts`) rather than plain `useRoute()`. Plain `useRoute()` returns a union of all routes; accessing `.params.slug` on it fails under `strict` + vue-tsc. Dynamic-segment pages (`c/[slug].vue`, `c/[slug]/members.vue`, etc.) all need the specific route name — though in practice no community page needs this any more, since they read `useCommunityContext()` instead. See also [multi-tenancy.md](multi-tenancy.md).
- **`router.push()` / `.replace()` return a Promise**; a bare, unawaited call at the end of an async
  handler leaves its rejection on a chain nothing observes. `NavDrawer.vue` attaches
  `.catch((e) => console.error('navigation failed', e))` to every post-action navigation.
- **Put a control that must exist on every protected route above the router, not on the routes.**
  Logout lives in exactly one place, `src/nav/NavDrawer.vue`, mounted by `App.vue` under
  `v-if="user"` — and `user` is non-null exactly when `status === 'authenticated'`, the same
  condition `src/auth/guard.ts` checks to admit a protected route. Since `App.vue` sits above every
  route, logout is reachable by construction rather than by convention: no second copy to keep in
  sync, and no future page can be added without it.

### Navigation data: resolve in `beforeResolve`, publish in `afterEach`

Route-derived app state (the active community, the `/` landing target) is owned by router guards,
not component lifecycle hooks — `src/communities/routeData.ts` and
`src/communities/landingGuard.ts` are the reference implementation.

- **Fetch in `beforeResolve`, write in `afterEach`.** Writing during `beforeResolve` lets an aborted
  navigation leave state describing a route the user never reached; writing in `afterEach` makes
  the header match the committed route by construction.
- **`afterEach` fires for failed navigations too, and receives the `failure` argument — check it.**
  Skipping failures is what turns a redirect back to the route we're already on into a true no-op.
- **A direct duplicate push and a guard-produced one are not distinguished by their failure.** Both
  reach `afterEach` with a `duplicated` `NavigationFailure` (type 16). The difference is upstream:
  `router.push('/x')` while already on `/x` fires *no* guards at all, whereas a guard-produced
  redirect to the route already in effect does run `beforeResolve` — so only the latter exercises
  the landing guard. A test that covers only the direct push proves nothing about it.
- **`push()` / `.replace()` resolve with a `NavigationFailure` for aborted/cancelled navigations —
  they only reject when a guard throws.** A `.catch()` therefore does not tell you the navigation
  succeeded; inspect the resolved value. Code that flips UI state only in a `.catch` path will
  silently mishandle an aborted navigation.
- **Never clear app-global route state from `onUnmounted`.** A component teardown hook fires on the
  way out of a route, with no knowledge of what the destination needs — so it clears state the
  incoming route may already depend on, a full round-trip before that route can restore it.
  Ownership belongs to the router, which sees both ends of the transition.
- **`router.isReady()` only settles once the initial navigation has run, and `router.install()` is
  what starts that navigation.** Awaiting `isReady()` before `app.use(router)` deadlocks. Order:
  `createApp(App).use(router)` → `await router.isReady()` → `app.mount()`.
- **Guard async loads with a generation counter** so a superseded navigation cannot publish its
  result — the same technique `useCountdown` uses for stale responses.
- **A pending indicator needs a delay (~150 ms, `PENDING_DELAY_MS`).** An indicator that flashes on
  a fast transition is itself the flicker it was added to explain.

## Community context + admin gating

Pages nested under `c/[slug]/` receive the loaded community via Vue's `provide`/`inject`, keyed on `communityKey` from `src/communities/context.ts`.

- The shell (`src/pages/c/[slug].vue`) renders `communityRoute` from `src/communities/routeData.ts` — a module-level ref that the `registerCommunityDataGuard` router guard **resolves in `beforeResolve`, before the route commits, and publishes in `afterEach`, once it has committed** — so the shell does no fetching of its own to decide what to render. It provides `{ community: Readonly<Ref<CommunityResponse>>, refresh }` and renders `<RouterView />` only in the `state?.kind === 'ready'` branch — so children can safely read `community.value` as non-null. `refresh()` is a separate, explicitly-triggered fetch (see below) — the guard only owns the *initial* resolve.
- The type mismatch (`Ref<CommunityResponse | null>` vs `Readonly<Ref<CommunityResponse>>`) is bridged with `community as unknown as Readonly<Ref<CommunityResponse>>`. This is intentional: the null case is excluded structurally (children only mount after ready), and `unknown` is necessary because TypeScript cannot widen through a `Readonly` wrapper.
- Child pages call `useCommunityContext()` (throws if context is missing) instead of `useRoute()` — they never need to re-fetch the slug from the router.
- `useAdminGuard()` (in `src/communities/useAdminGuard.ts`) redirects to `communityPath(slug)` on `onMounted` if `viewerIsAdmin` is false. This is a UX guard only — the backend `@RequireAdmin` annotation is the real gate.
- Admin-only pages (`members.vue`, `settings.vue`, `requests.vue`) all call `useAdminGuard()` at the top of `<script setup>`.
- In tests, mock the entire context module: `vi.mock('@/communities/context', () => ({ useCommunityContext: () => ({ community: { value: { ...fields } }, refresh: vi.fn() }) }))`. This avoids the `inject` dependency on a real Vue app wrapping.
- `CommunityResponse` includes `viewerIsAdmin: boolean` and `pendingCount: number` returned by the backend; both are republished into `activeCommunity` for the header's community menu (see "App-level header state" in [frontend-state.md](frontend-state.md)) rather than consumed inside the shell itself.
- `refresh()` deliberately keeps no internal `try`/`catch` — a rejection is the caller's to handle, not something it swallows. It is handed to every `[slug]` child through `provide(communityKey, …)`, so this contract binds every child, not just the shell: wrap the call in your own `try`/`catch`, and don't treat the action as having succeeded until `refresh()` itself has resolved. `requests.vue` and `settings.vue` both fold their `await refresh()` into the same `try` as the mutating call, so a rejection there still lands in the `catch` instead of being reported as a silent success.

## Role-gated areas + shell-owned access checks

The super-admin area (`/super-admin`) is undiscoverable rather than unlinked: the only entry
point is an entry in the drawer's foot block, rendered under `v-if="user.isSuperAdmin"`, so a
viewer without the role sees no trace of it. Gate any such entry point on the role itself — never on
a plain link that a non-holder can see and bounce off.
Pattern, mirroring the `c/[slug].vue` shell:

- `src/pages/super-admin.vue` is a **layout** for `src/pages/super-admin/*.vue`. No router config is
  needed, and no slug needs reserving: communities live under `/c/`, so the root namespace is free
  for pages (see [multi-tenancy.md](multi-tenancy.md)).
- The shell does the role check **once** and keeps `<RouterView/>` inside the authorised branch.
  Children then contain no access logic and, more importantly, never mount for an unauthorised
  viewer — so they never fire a request that would 403. The backend rule is the real gate.
- No `meta` flag and no change to `guard.ts` is needed for this; adding one would only duplicate
  what the shell already enforces.
