# Frontend — routing, shells & access (webapp-vue)

Route definition, guard-owned navigation data, the `[slug]` community shell and
role-gated areas. Siblings: [frontend.md](frontend.md) (stack, HTTP, tooling),
[frontend-ui.md](frontend-ui.md), [frontend-state.md](frontend-state.md),
[frontend-testing.md](frontend-testing.md).

## Routing — Vue Router 5 built-in file-based routing

`unplugin-vue-router` is absorbed into Vue Router 5 core — use the built-in:

- `import VueRouter from 'vue-router/vite'` as a Vite plugin, **before** `vue()` — and in
  `vitest.config.ts` too ([frontend-testing.md](frontend-testing.md)).
- `import { routes } from 'vue-router/auto-routes'`; pages live in `src/pages/`.
- The generated `typed-router.d.ts` is committed and listed in `tsconfig`.
- Per-route meta via the **`definePage({ meta: { ... } })`** macro (compile-time).
- **A route-ranking test belongs in `src/__tests__/`** — a catch-all shadowing a real page is a
  whole-router concern, and only a test over the generated table sees it.
- **Typed route params:** `useRoute('/c/[slug]')`, not plain `useRoute()` — the latter is a union
  of all routes, and `.params.slug` on it fails under strict TS. Community pages read
  `useCommunityContext()` instead.
- **`router.push()` / `.replace()` return a Promise.** A bare call at the end of an async handler
  leaves its rejection unobserved: attach `.catch((e) => console.error('navigation failed', e))`
  (`NavDrawer.vue`).
- **A control that must exist on every protected route sits above the router, not on the
  routes.** Logout lives once, in `nav/NavDrawer.vue`, mounted by `App.vue` under `v-if="user"` —
  the condition `auth/guard.ts` admits a protected route on. Reachable by construction.

### Navigation data: resolve in `beforeResolve`, publish in `afterEach`

Route-derived app state (the active community, the `/` landing target) is owned by router guards,
not component lifecycle hooks — `communities/routeData.ts` and `communities/landingGuard.ts`.

- **Fetch in `beforeResolve`, write in `afterEach`.** A write during `beforeResolve` lets an
  aborted navigation leave state describing a route the user never reached.
- **`afterEach` fires for failed navigations too — check its `failure` argument.** Skipping
  failures is what makes a redirect back to the current route a no-op.
- **A direct duplicate push and a guard-produced one fail alike** (`duplicated`, type 16), but
  `router.push('/x')` on `/x` fires no guards, while a guard-produced redirect runs
  `beforeResolve`. A test covering only the direct push proves nothing about the landing guard.
- **`push()` / `.replace()` resolve with a `NavigationFailure` for aborted navigations; they only
  reject when a guard throws.** Inspect the resolved value — UI state flipped only in a `.catch`
  mishandles an abort.
- **Never clear app-global route state from `onUnmounted`.** A teardown hook knows nothing of the
  destination and clears what the incoming route already depends on. The router sees both ends.
- **`router.isReady()` settles only after the initial navigation, which `router.install()`
  starts.** Order: `createApp(App).use(router)` → `await router.isReady()` → `app.mount()`.
- **Guard async loads with a generation counter,** so a superseded navigation cannot publish.
- **A pending indicator needs a delay** (~150 ms, `PENDING_DELAY_MS`), or it is the flicker it was
  added to explain.
- **A failed lazy-route import means a stale build: reload, once.** A tab open across a deploy
  requests chunk hashes that are gone, and the router aborts silently. `staleBuildReload.ts` turns
  the error into a full load of the target, guarded per path in `sessionStorage` against a loop.
  Engines word the error differently — match all three.

## Community context + admin gating

Pages under `c/[slug]/` receive the loaded community via `provide`/`inject`, keyed on
`communityKey` (`communities/context.ts`).

- **The shell (`pages/c/[slug].vue`) fetches nothing to decide what to render:** it renders
  `communityRoute` (`communities/routeData.ts`), which `registerCommunityDataGuard` resolves and
  publishes. It renders `<RouterView />` only in the `ready` branch, so children read
  `community.value` as non-null; the cast `as unknown as Readonly<Ref<CommunityResponse>>` bridges
  that on purpose.
- **Child pages call `useCommunityContext()`** (throws without context), never `useRoute()`.
- **`useAdminGuard()` at the top of every admin-only page** (`members.vue`, `settings.vue`, …)
  redirects a non-admin on mount. A UX guard only — the backend's `CommunityAccess.requireAdmin`
  is the gate.
- **In tests, mock the whole context module:**
  `vi.mock('@/communities/context', () => ({ useCommunityContext: () => ({ community: { value: { ...fields } }, refresh: vi.fn() }) }))`.
- **A page that changes guard-owned data calls `refresh()` — navigating away and back will not.**
  `beforeResolve` returns early for the slug already loaded, so `activeCommunity` (viewer identity,
  `viewerIsAdmin`, `pendingCount`) survives a round trip untouched. Where the writing component
  must also work outside a community, give it a `saved` emit and let the page own the `refresh()`.
- **`refresh()` has no `try`/`catch` of its own — a rejection is the caller's.** Fold
  `await refresh()` into the same `try` as the mutating call, and don't treat the action as done
  before it resolves (`requests.vue`, `settings.vue`).

## Role-gated areas + shell-owned access checks

- **A role-gated area is undiscoverable, not merely unlinked.** `/super-admin`'s only entry is in
  the drawer's foot block under `v-if="user.isSuperAdmin"`. Gate the entry point on the role —
  never a link a non-holder can see and bounce off.
- **`pages/super-admin.vue` is a layout for `pages/super-admin/*.vue`.** No router config, and no
  slug to reserve: communities live under `/c/` ([multi-tenancy.md](multi-tenancy.md)).
- **The shell checks the role once and keeps `<RouterView/>` inside the authorised branch.**
  Children hold no access logic and never mount for an unauthorised viewer, so they never fire a
  request that would 403. The backend rule is the real gate.
- No `meta` flag and no change to `guard.ts`: it would duplicate what the shell enforces.
