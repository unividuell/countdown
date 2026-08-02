# Flicker-Free Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the SPA from painting wrong intermediate states during navigation, by resolving a route's data before the navigation commits instead of after.

**Architecture:** Two router hooks own community route resolution — `beforeResolve` fetches, `afterEach` publishes. The current view therefore stays on screen untouched until the destination is ready, and the header's `activeCommunity` ref is written only for routes that actually committed. A separate guard turns `/` from a page that renders while it decides into a redirect resolved before commit. A delayed progress bar acknowledges slow transitions.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Vue Router 5 with built-in file-based routing, Vite 8, Tailwind v4, Vitest + `@vue/test-utils` + happy-dom, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-02-navigation-flicker-design.md`](../specs/2026-08-02-navigation-flicker-design.md)

## Global Constraints

- All work is in `webapp-vue/`. **No backend change.**
- Run every command from `webapp-vue/`: `pnpm test <path>` runs a single spec, `pnpm test` the suite, `pnpm typecheck` and `pnpm lint` must both stay clean.
- TypeScript is **very strict**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. Type-only imports must use `import type`.
- **Mocking is Vitest `vi`**, never mockk. Guard tests use a real router built with `createMemoryHistory` and assert on `router.currentRoute` / observable state, not on mock echoes.
- **App-global state is a module-level `ref`** (no Pinia), with a colocated `_reset*State()` hook so Vitest cases don't leak into each other.
- **No cache.** Every entry into a new community route awaits a fresh `getCommunity`.
- German user-facing copy, matching the existing strings exactly: `Kein Zugriff`, `Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.`, `Etwas ist schiefgelaufen`, `Bitte später erneut versuchen.`
- Commit after every task. Do not push; do not open a PR (that is the finishing step, outside this plan).

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/navigationProgress.ts` | **new** — `navigationPending` ref, delay logic, `registerNavigationProgress(router)` |
| `src/communities/routeData.ts` | **new** — `CommunityRouteState`, `communityRoute` ref, `publishCommunity`, `registerCommunityDataGuard(router)` |
| `src/communities/landingGuard.ts` | **new** — `resolveLandingTarget()`, `landingFailed` ref, `registerLandingRedirect(router)` |
| `src/pages/[slug].vue` | renderer over `communityRoute`; keeps `provide(communityKey, …)` and `refresh` |
| `src/pages/index.vue` | landing-failure view with retry; unreachable on the happy path |
| `src/App.vue` | progress bar under the header |
| `src/communities/CommunityMenu.vue` | navigate immediately; the guard persists the selection |
| `src/main.ts` | guard registration order; install-then-`isReady()`-then-mount |
| `index.html` | static header placeholder while the app boots |

> **Deviation from the spec's file table, deliberate:** the spec parked `navigationPending` inside `routeData.ts`. It is a distinct responsibility (navigation chrome vs. community data) with its own test surface, so it gets its own module. Nothing else about the design changes.

---

### Task 1: Navigation progress indicator

The bar must not appear on fast transitions — a bar that flashes for 30 ms is the same defect at smaller scale.

**Files:**
- Create: `webapp-vue/src/ui/navigationProgress.ts`
- Create: `webapp-vue/src/ui/__tests__/navigationProgress.spec.ts`
- Modify: `webapp-vue/src/App.vue` (template, after `</header>`)
- Modify: `webapp-vue/src/main.ts`
- Modify: `webapp-vue/src/__tests__/app-header.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const PENDING_DELAY_MS = 150`
  - `export const navigationPending: Ref<boolean>`
  - `export function registerNavigationProgress(router: Router): void`
  - `export function _resetNavigationProgressState(): void`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/ui/__tests__/navigationProgress.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import {
  PENDING_DELAY_MS,
  _resetNavigationProgressState,
  navigationPending,
  registerNavigationProgress,
} from '@/ui/navigationProgress'

const Stub = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/x', component: Stub },
    ],
  })
}

describe('navigation progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetNavigationProgressState()
  })
  afterEach(() => vi.useRealTimers())

  it('stays hidden for a navigation that finishes inside the delay', async () => {
    const router = makeRouter()
    registerNavigationProgress(router)
    await router.push('/x')
    vi.advanceTimersByTime(10_000)
    expect(navigationPending.value).toBe(false)
  })

  it('appears once a navigation outlasts the delay, and clears when it lands', async () => {
    const router = makeRouter()
    let release!: () => void
    const blocked = new Promise<void>((r) => {
      release = r
    })
    router.beforeResolve(async () => {
      await blocked
      return true
    })
    registerNavigationProgress(router)

    const nav = router.push('/x')
    await Promise.resolve()
    expect(navigationPending.value).toBe(false)

    vi.advanceTimersByTime(PENDING_DELAY_MS)
    expect(navigationPending.value).toBe(true)

    release()
    await nav
    expect(navigationPending.value).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/navigationProgress.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/navigationProgress"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/ui/navigationProgress.ts`:

```ts
import { ref } from 'vue'
import type { Router } from 'vue-router'

// A bar that flashes for 30 ms is itself a flicker — the very defect this indicator
// belongs to fixing. Only a transition the user can actually perceive gets one.
export const PENDING_DELAY_MS = 150

export const navigationPending = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function stop(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  navigationPending.value = false
}

export function registerNavigationProgress(router: Router): void {
  router.beforeEach(() => {
    stop()
    timer = setTimeout(() => {
      navigationPending.value = true
    }, PENDING_DELAY_MS)
    return true
  })
  // afterEach also fires for aborted and redirected navigations, so the bar cannot
  // get stranded on a navigation that never commits.
  router.afterEach(stop)
  router.onError(stop)
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetNavigationProgressState(): void {
  stop()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/navigationProgress.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing App.vue test**

Add to `webapp-vue/src/__tests__/app-header.spec.ts` — import the ref at the top:

```ts
import { navigationPending } from '@/ui/navigationProgress'
```

reset it inside the existing `beforeEach`:

```ts
    navigationPending.value = false
```

and append this case inside `describe('App main header', …)`:

```ts
  it('shows the navigation progress bar only while a navigation is pending', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=navigation-progress]').exists()).toBe(
      false,
    )
    navigationPending.value = true
    expect(mount(App, { global: { stubs } }).find('[data-test=navigation-progress]').exists()).toBe(
      true,
    )
  })
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd webapp-vue && pnpm test src/__tests__/app-header.spec.ts`
Expected: FAIL — the second `expect` gets `false`.

- [ ] **Step 7: Add the bar to App.vue**

In `webapp-vue/src/App.vue`, add the import to `<script setup>`:

```ts
import { navigationPending } from '@/ui/navigationProgress'
```

and insert the element in the template directly after the closing `</header>` tag, before `<main …>`:

```html
    <div
      v-if="navigationPending"
      data-test="navigation-progress"
      role="progressbar"
      aria-label="Seite wird geladen"
      class="h-0.5 w-full animate-pulse bg-blue-500"
    />
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd webapp-vue && pnpm test src/__tests__/app-header.spec.ts`
Expected: PASS.

- [ ] **Step 9: Register it in main.ts**

In `webapp-vue/src/main.ts`, add the import and the registration next to the existing `registerAuthGuard(router)`:

```ts
import { registerNavigationProgress } from '@/ui/navigationProgress'
```

```ts
registerAuthGuard(router)
registerNavigationProgress(router)
```

- [ ] **Step 10: Verify the whole suite and the types**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add webapp-vue/src/ui/navigationProgress.ts webapp-vue/src/ui/__tests__/navigationProgress.spec.ts webapp-vue/src/App.vue webapp-vue/src/main.ts webapp-vue/src/__tests__/app-header.spec.ts
git commit -m "feat(web): delayed progress bar for slow navigations"
```

---

### Task 2: Community route data module

The guard is written and tested here but **not registered** — the app keeps its current behaviour until Task 3 switches over. This keeps the tree green at every commit.

**Files:**
- Create: `webapp-vue/src/communities/routeData.ts`
- Create: `webapp-vue/src/communities/__tests__/routeData.spec.ts`

**Interfaces:**
- Consumes: `getCommunity`, `setSelection` from `@/api/communities`; `ApiError` from `@/api/client`; `activeCommunity` from `@/communities/context`; `CommunityResponse` from `@/api/types`.
- Produces:
  - `export type CommunityRouteState = { kind: 'ready'; community: CommunityResponse } | { kind: 'no-access' } | { kind: 'error' }`
  - `export const communityRoute: Ref<CommunityRouteState | null>`
  - `export function publishCommunity(c: CommunityResponse): void`
  - `export function registerCommunityDataGuard(router: Router): void`
  - `export function _resetRouteDataState(): void`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/communities/__tests__/routeData.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import {
  _resetRouteDataState,
  communityRoute,
  registerCommunityDataGuard,
} from '@/communities/routeData'

const Stub = defineComponent({ render: () => h('div') })

function community(over: Partial<CommunityResponse> = {}): CommunityResponse {
  return {
    id: 'c1',
    name: 'Team Süd',
    slug: 'team',
    startsAt: null,
    startsAtTimezone: 'Europe/Berlin',
    phaseTwoStartRound: null,
    viewerIsAdmin: false,
    pendingCount: 0,
    ...over,
  }
}
const nord = community({ id: 'c2', name: 'Team Nord', slug: 'nord' })
const west = community({ id: 'c3', name: 'Team West', slug: 'west' })

// Mirrors the file-based layout: a `/[slug]` shell record with child routes.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/communities', component: Stub },
      {
        path: '/:slug',
        component: Stub,
        children: [
          { path: '', component: Stub },
          { path: 'members', component: Stub },
        ],
      },
    ],
  })
  registerCommunityDataGuard(router)
  return router
}

describe('community route data guard', () => {
  beforeEach(() => {
    _resetRouteDataState()
    activeCommunity.value = null
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('publishes the community into the header state once the navigation commits', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/team/')
    expect(communityRoute.value).toEqual({ kind: 'ready', community: community() })
    expect(activeCommunity.value).toMatchObject({ slug: 'team', name: 'Team Süd' })
  })

  it('persists the selection as a last-visited marker', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const select = vi.mocked(api.setSelection)
    const router = makeRouter()
    await router.push('/team/')
    await flushPromises()
    expect(select).toHaveBeenCalledWith('c1')
  })

  it('keeps the current community in the header while the next one is still loading', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community())
    const router = makeRouter()
    await router.push('/team/')

    let release!: (c: CommunityResponse) => void
    get.mockReturnValueOnce(
      new Promise<CommunityResponse>((r) => {
        release = r
      }),
    )
    const nav = router.push('/nord/')
    await flushPromises()

    // Mid-flight the user still sees the old page, so the header must still describe it.
    expect(activeCommunity.value?.slug).toBe('team')
    expect(router.currentRoute.value.params.slug).toBe('team')

    release(nord)
    await nav
    expect(activeCommunity.value?.slug).toBe('nord')
  })

  it('discards a superseded fetch', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValueOnce(community())
    const router = makeRouter()
    await router.push('/team/')

    let releaseNord!: (c: CommunityResponse) => void
    get.mockReturnValueOnce(
      new Promise<CommunityResponse>((r) => {
        releaseNord = r
      }),
    )
    const navNord = router.push('/nord/')
    await flushPromises()

    get.mockResolvedValueOnce(west)
    await router.push('/west/')

    releaseNord(nord)
    await navNord
    await flushPromises()
    expect(activeCommunity.value?.slug).toBe('west')
    expect(router.currentRoute.value.params.slug).toBe('west')
  })

  it('does not refetch when moving between sub-routes of one community', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/team/members')
    expect(get).toHaveBeenCalledTimes(1)
    expect(activeCommunity.value?.slug).toBe('team')
  })

  it('refetches when the slug changes', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    get.mockResolvedValueOnce(community()).mockResolvedValueOnce(nord)
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/nord/')
    expect(get).toHaveBeenCalledTimes(2)
    expect(activeCommunity.value?.name).toBe('Team Nord')
  })

  it('clears the header when leaving the community area', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community())
    const router = makeRouter()
    await router.push('/team/')
    await router.push('/communities')
    expect(communityRoute.value).toBeNull()
    expect(activeCommunity.value).toBeNull()
  })

  it('reports no-access on 404, commits the URL, and clears the header', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(404, 'no access'))
    const router = makeRouter()
    await router.push('/ghost/')
    expect(communityRoute.value).toEqual({ kind: 'no-access' })
    expect(router.currentRoute.value.params.slug).toBe('ghost')
    // A failed switch must not leave the previous community's admin links and
    // pending dot standing in the header.
    expect(activeCommunity.value).toBeNull()
  })

  it('reports a generic error for a non-404 failure', async () => {
    vi.spyOn(api, 'getCommunity').mockRejectedValue(new ApiError(500, 'boom'))
    const router = makeRouter()
    await router.push('/team/')
    expect(communityRoute.value).toEqual({ kind: 'error' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/routeData.spec.ts`
Expected: FAIL — `Failed to resolve import "@/communities/routeData"`.

- [ ] **Step 3: Write the implementation**

Create `webapp-vue/src/communities/routeData.ts`:

```ts
import { ref } from 'vue'
import type { Router } from 'vue-router'
import { ApiError } from '@/api/client'
import { getCommunity, setSelection } from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'

export type CommunityRouteState =
  | { kind: 'ready'; community: CommunityResponse }
  | { kind: 'no-access' }
  | { kind: 'error' }

export const communityRoute = ref<CommunityRouteState | null>(null)

/** The single write path into the header state — the guard and the shell's refresh() share it. */
export function publishCommunity(c: CommunityResponse): void {
  communityRoute.value = { kind: 'ready', community: c }
  activeCommunity.value = {
    slug: c.slug,
    name: c.name,
    startsAt: c.startsAt,
    startsAtTimezone: c.startsAtTimezone,
    viewerIsAdmin: c.viewerIsAdmin,
    pendingCount: c.pendingCount,
  }
}

function slugOf(route: { params: Record<string, unknown> }): string | null {
  const s = route.params.slug
  return typeof s === 'string' && s.length > 0 ? s : null
}

async function load(slug: string): Promise<CommunityRouteState> {
  try {
    return { kind: 'ready', community: await getCommunity(slug) }
  } catch (e) {
    return e instanceof ApiError && e.status === 404 ? { kind: 'no-access' } : { kind: 'error' }
  }
}

export function registerCommunityDataGuard(router: Router): void {
  let seq = 0
  let pending: { slug: string; state: CommunityRouteState } | null = null

  // Read before the commit: the destination's data is fetched while the current view
  // stays untouched on screen. Never blocks the navigation — a 404 or a network error
  // is a render state, so the URL and the header stay in agreement with each other.
  router.beforeResolve(async (to) => {
    const slug = slugOf(to)
    if (!slug) return true
    const current = communityRoute.value
    if (current?.kind === 'ready' && current.community.slug === slug) return true

    const mine = ++seq
    const state = await load(slug)
    if (mine !== seq) return true // a newer navigation owns the state now
    pending = { slug, state }
    return true
  })

  // Write after the commit. Skipping failures (aborted, cancelled, duplicated) is what
  // makes a redirect back to the route we are already on a genuine no-op.
  router.afterEach((to, _from, failure) => {
    if (failure) return
    const slug = slugOf(to)
    if (!slug) {
      pending = null
      communityRoute.value = null
      activeCommunity.value = null
      return
    }
    if (pending?.slug !== slug) return
    const { state } = pending
    pending = null
    if (state.kind !== 'ready') {
      communityRoute.value = state
      activeCommunity.value = null
      return
    }
    publishCommunity(state.community)
    // A "last visited" marker only — losing it must never affect the navigation.
    setSelection(state.community.id).catch((e) =>
      console.error('could not persist the community selection', e),
    )
  })
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetRouteDataState(): void {
  communityRoute.value = null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/routeData.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Verify nothing else regressed**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass — the module is not wired in yet, so behaviour is unchanged.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/communities/routeData.ts webapp-vue/src/communities/__tests__/routeData.spec.ts
git commit -m "feat(web): resolve community route data before the navigation commits"
```

---

### Task 3: Switch the `[slug]` shell onto the guard

This is the commit where the community switch stops flickering. The shell becomes a pure renderer, and the guard takes over both the fetch and the `activeCommunity` lifecycle.

**Files:**
- Modify: `webapp-vue/src/pages/[slug].vue` (whole file)
- Modify: `webapp-vue/src/main.ts`
- Rewrite: `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`

**Interfaces:**
- Consumes: `communityRoute`, `publishCommunity`, `registerCommunityDataGuard` from `@/communities/routeData` (Task 2).
- Produces: no new exports. `provide(communityKey, { community, refresh })` keeps its existing contract — `refresh()` still has no internal `try`/`catch`, so a rejection remains the caller's.

- [ ] **Step 1: Rewrite the shell spec**

Replace the entire contents of `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import { _resetRouteDataState, communityRoute } from '@/communities/routeData'

vi.mock('vue-router', async () => {
  const { defineComponent, inject } = await import('vue')
  const { communityKey } = await import('@/communities/context')
  return {
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
    RouterView: defineComponent({
      setup() {
        const ctx = inject(communityKey)
        return { doRefresh: () => ctx?.refresh() }
      },
      template: '<button data-test="do-refresh" @click="doRefresh()">child</button>',
    }),
  }
})

function community(over: Partial<CommunityResponse> = {}): CommunityResponse {
  return {
    id: '1',
    name: 'Team',
    slug: 'team',
    startsAt: null,
    startsAtTimezone: 'Europe/Berlin',
    phaseTwoStartRound: null,
    viewerIsAdmin: true,
    pendingCount: 3,
    ...over,
  }
}

async function mountShell() {
  const Shell = (await import('@/pages/[slug].vue')).default
  return mount(Shell)
}

describe('community shell', () => {
  beforeEach(() => {
    _resetRouteDataState()
    activeCommunity.value = null
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the child route when the guard resolved a community', async () => {
    communityRoute.value = { kind: 'ready', community: community() }
    const w = await mountShell()
    expect(w.find('[data-test=do-refresh]').exists()).toBe(true)
  })

  it('shows no-access without rendering children', async () => {
    communityRoute.value = { kind: 'no-access' }
    const w = await mountShell()
    expect(w.text()).toMatch(/kein Zugriff/i)
    expect(w.find('[data-test=do-refresh]').exists()).toBe(false)
  })

  it('shows the generic error without rendering children', async () => {
    communityRoute.value = { kind: 'error' }
    const w = await mountShell()
    expect(w.text()).toMatch(/schiefgelaufen/i)
    expect(w.find('[data-test=do-refresh]').exists()).toBe(false)
  })

  it('renders no community chrome in the content area', async () => {
    communityRoute.value = { kind: 'ready', community: community() }
    const w = await mountShell()
    expect(w.find('header').exists()).toBe(false)
    expect(w.find('[data-test=logout]').exists()).toBe(false)
    expect(w.find('[data-test=community-menu]').exists()).toBe(false)
    expect(w.text()).not.toContain('Team')
  })

  it('republishes into the header when a child refreshes the context', async () => {
    communityRoute.value = { kind: 'ready', community: community() }
    const w = await mountShell()
    vi.spyOn(api, 'getCommunity').mockResolvedValue(community({ pendingCount: 0 }))
    await w.find('[data-test=do-refresh]').trigger('click')
    await flushPromises()
    // Publishing only on the initial resolve would leave a stale pending dot behind
    // after an admin clears the requests.
    expect(activeCommunity.value?.pendingCount).toBe(0)
  })

  it('does not fetch on its own — the guard owns that', async () => {
    const get = vi.spyOn(api, 'getCommunity')
    communityRoute.value = { kind: 'ready', community: community() }
    await mountShell()
    await flushPromises()
    expect(get).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/slug-shell.spec.ts`
Expected: FAIL — the shell still calls `useRoute()` (removed from the mock) and still fetches in `onMounted`.

- [ ] **Step 3: Rewrite the shell**

Replace the entire contents of `webapp-vue/src/pages/[slug].vue`:

```vue
<script setup lang="ts">
import { computed, provide } from 'vue'
import type { Ref } from 'vue'
import { RouterView } from 'vue-router'
import { getCommunity } from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { communityKey } from '@/communities/context'
import { communityRoute, publishCommunity } from '@/communities/routeData'

// The router guard resolves the community before this route commits, so the shell
// only ever renders a settled state — there is no loading branch to flash.
const state = computed(() => communityRoute.value)
const community = computed(() =>
  communityRoute.value?.kind === 'ready' ? communityRoute.value.community : null,
)

async function refresh(): Promise<void> {
  const c = community.value
  if (c) publishCommunity(await getCommunity(c.slug))
}

// Non-null inside the 'ready' branch (RouterView only renders then). Children inject this.
provide(communityKey, {
  community: community as unknown as Readonly<Ref<CommunityResponse>>,
  refresh,
})
</script>

<template>
  <div v-if="state?.kind === 'no-access'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">
      Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.
    </p>
  </div>
  <div v-else-if="state?.kind === 'error'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="text-sm text-neutral-600">Bitte später erneut versuchen.</p>
  </div>
  <RouterView v-else-if="state?.kind === 'ready'" />
</template>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/slug-shell.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the guard**

In `webapp-vue/src/main.ts`, add the import and register it after the auth guard:

```ts
import { registerCommunityDataGuard } from '@/communities/routeData'
```

```ts
registerAuthGuard(router)
registerCommunityDataGuard(router)
registerNavigationProgress(router)
```

- [ ] **Step 6: Verify the whole suite and the types**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/pages/[slug].vue webapp-vue/src/pages/__tests__/slug-shell.spec.ts webapp-vue/src/main.ts
git commit -m "refactor(web): make the community shell a renderer over guard-resolved state"
```

---

### Task 4: Landing redirect in a guard

This is the commit that fixes the reported flow. `/` stops being a page that renders while it decides.

**Files:**
- Create: `webapp-vue/src/communities/landingGuard.ts`
- Create: `webapp-vue/src/communities/__tests__/landingGuard.spec.ts`
- Modify: `webapp-vue/src/pages/index.vue` (whole file)
- Modify: `webapp-vue/src/main.ts`
- Rewrite: `webapp-vue/src/pages/__tests__/index.spec.ts`

**Interfaces:**
- Consumes: `consumePostLoginRedirect` from `@/auth/postLoginRedirect`; `useCommunities` from `@/communities/useCommunities`; `registerCommunityDataGuard`, `_resetRouteDataState` from `@/communities/routeData` (Task 2).
- Produces:
  - `export const landingFailed: Ref<boolean>`
  - `export async function resolveLandingTarget(): Promise<string | null>` — the redirect path, or `null` when resolution failed
  - `export function registerLandingRedirect(router: Router): void`
  - `export function _resetLandingState(): void`

- [ ] **Step 1: Write the failing guard test**

Create `webapp-vue/src/communities/__tests__/landingGuard.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, watch } from 'vue'
import * as api from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity } from '@/communities/context'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { _resetRouteDataState, registerCommunityDataGuard } from '@/communities/routeData'
import {
  _resetLandingState,
  landingFailed,
  registerLandingRedirect,
} from '@/communities/landingGuard'

const Stub = defineComponent({ render: () => h('div') })

const team: CommunityResponse = {
  id: 'c1',
  name: 'Team Süd',
  slug: 'team',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
}

// Both guards, in the order main.ts registers them: beforeResolve hooks run in
// registration order, so the landing redirect claims '/' before anything else.
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/communities', component: Stub },
      { path: '/join/:token', component: Stub },
      { path: '/:slug', component: Stub, children: [{ path: '', component: Stub }] },
    ],
  })
  registerLandingRedirect(router)
  registerCommunityDataGuard(router)
  return router
}

describe('landing redirect guard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    _resetLandingState()
    _resetRouteDataState()
    _resetCommunitiesState()
    activeCommunity.value = null
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    vi.spyOn(api, 'getCommunity').mockResolvedValue(team)
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends a member of exactly one community straight to it', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: 'c1', name: 'Team Süd', slug: 'team' }])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.params.slug).toBe('team')
  })

  it('sends a member with no communities to the overview', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/communities')
  })

  it('sends a member with several and no last selection to the overview', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: 'c1', name: 'Team Süd', slug: 'team' },
      { id: 'c2', name: 'Team Nord', slug: 'nord' },
    ])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/communities')
  })

  it('returns to the stashed post-login destination instead of the landing', async () => {
    sessionStorage.setItem('postLoginRedirect', '/join/tok123')
    const list = vi.spyOn(api, 'listCommunities')
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/join/tok123')
    expect(list).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('postLoginRedirect')).toBeNull()
  })

  it('records a failure so / can offer a retry instead of hanging', async () => {
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('offline'))
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
    expect(landingFailed.value).toBe(true)
  })

  it('leaves the header untouched when home resolves back to the current community', async () => {
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: 'c1', name: 'Team Süd', slug: 'team' }])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: 'c1' })
    const get = vi.mocked(api.getCommunity)
    const router = makeRouter()
    await router.push('/team/')
    await flushPromises()

    const seen: (string | null)[] = []
    const stop = watch(activeCommunity, (v) => seen.push(v?.slug ?? null), { flush: 'sync' })
    await router.push('/')
    await flushPromises()
    stop()

    // The reported defect: the header used to fall back to 'countdown' and the content
    // to the landing placeholder before arriving back where it started.
    expect(seen).toEqual([])
    expect(activeCommunity.value?.slug).toBe('team')
    expect(router.currentRoute.value.params.slug).toBe('team')
    expect(get).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/landingGuard.spec.ts`
Expected: FAIL — `Failed to resolve import "@/communities/landingGuard"`.

- [ ] **Step 3: Write the guard**

Create `webapp-vue/src/communities/landingGuard.ts`:

```ts
import { ref } from 'vue'
import type { Router } from 'vue-router'
import { consumePostLoginRedirect } from '@/auth/postLoginRedirect'
import { useCommunities } from '@/communities/useCommunities'

/** Set when the landing resolution failed, so '/' renders a retry rather than hanging. */
export const landingFailed = ref(false)

/** The path '/' should redirect to, or null when it could not be determined. */
export async function resolveLandingTarget(): Promise<string | null> {
  // A user bounced to login from a specific destination (e.g. /join/<token>) returns
  // there rather than to the default landing.
  const stashed = consumePostLoginRedirect()
  if (stashed) return stashed
  try {
    const l = await useCommunities().landing()
    return l.kind === 'none' || l.kind === 'choose' ? '/communities' : `/${l.slug}/`
  } catch (e) {
    console.error('could not resolve the landing destination', e)
    return null
  }
}

export function registerLandingRedirect(router: Router): void {
  router.beforeResolve(async (to) => {
    if (to.path !== '/') return true
    const target = await resolveLandingTarget()
    landingFailed.value = target === null
    // On failure the navigation is admitted so index.vue can show the retry; the
    // resolved target never is '/', so this cannot loop.
    return target ?? true
  })
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetLandingState(): void {
  landingFailed.value = false
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/landingGuard.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Rewrite the index page spec**

Replace the entire contents of `webapp-vue/src/pages/__tests__/index.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { _resetLandingState, landingFailed } from '@/communities/landingGuard'

const replace = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

async function mountIndex() {
  const Index = (await import('@/pages/index.vue')).default
  return mount(Index)
}

describe('landing page', () => {
  beforeEach(() => {
    replace.mockClear()
    sessionStorage.clear()
    _resetLandingState()
    _resetCommunitiesState()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows nothing actionable on the happy path — the guard redirects before it renders', async () => {
    const w = await mountIndex()
    expect(w.find('[data-test=landing-retry]').exists()).toBe(false)
  })

  it('offers a retry once the landing resolution has failed', async () => {
    landingFailed.value = true
    const w = await mountIndex()
    expect(w.text()).toMatch(/schiefgelaufen/i)
    expect(w.find('[data-test=landing-retry]').exists()).toBe(true)
  })

  it('navigates to the resolved target when the retry succeeds', async () => {
    landingFailed.value = true
    vi.spyOn(api, 'listCommunities').mockResolvedValue([{ id: 'c1', name: 'Team', slug: 'team' }])
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    const w = await mountIndex()
    await w.find('[data-test=landing-retry]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/team/')
    expect(landingFailed.value).toBe(false)
  })

  it('stays on the error view when the retry fails again', async () => {
    landingFailed.value = true
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('still offline'))
    vi.spyOn(api, 'getSelection').mockResolvedValue({ communityId: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await mountIndex()
    await w.find('[data-test=landing-retry]').trigger('click')
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    expect(landingFailed.value).toBe(true)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/index.spec.ts`
Expected: FAIL — `index.vue` still redirects in `onMounted` and has no retry control.

- [ ] **Step 7: Rewrite the index page**

Replace the entire contents of `webapp-vue/src/pages/index.vue`:

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { landingFailed, resolveLandingTarget } from '@/communities/landingGuard'

// The landing redirect is resolved in a router guard before this route commits, so on
// the happy path this component never renders. It exists for the failure case.
const router = useRouter()

async function retry(): Promise<void> {
  const target = await resolveLandingTarget()
  landingFailed.value = target === null
  if (target) router.replace(target).catch((e) => console.error('navigation failed', e))
}
</script>

<template>
  <section v-if="landingFailed" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="mb-4 text-sm text-neutral-600">
      Deine Spielgemeinschaften konnten nicht geladen werden.
    </p>
    <button
      type="button"
      data-test="landing-retry"
      class="cursor-pointer rounded border px-3 py-1.5 text-sm hover:bg-neutral-200"
      @click="retry"
    >
      Erneut versuchen
    </button>
  </section>
</template>
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/index.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Register the landing guard**

In `webapp-vue/src/main.ts`, add the import and register it **before** the community data guard:

```ts
import { registerLandingRedirect } from '@/communities/landingGuard'
```

```ts
// beforeResolve hooks run in registration order: the landing redirect must claim '/'
// before anything downstream reacts to a route that is about to be replaced.
registerAuthGuard(router)
registerLandingRedirect(router)
registerCommunityDataGuard(router)
registerNavigationProgress(router)
```

- [ ] **Step 10: Verify the whole suite and the types**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add webapp-vue/src/communities/landingGuard.ts webapp-vue/src/communities/__tests__/landingGuard.spec.ts webapp-vue/src/pages/index.vue webapp-vue/src/pages/__tests__/index.spec.ts webapp-vue/src/main.ts
git commit -m "fix(web): resolve the landing destination before '/' commits"
```

---

### Task 5: Cold start — resolve before the first paint

A direct hit on `/hhh/` still paints the header as "countdown" and swaps it once the guard's fetch lands. Same defect, first paint.

**Files:**
- Modify: `webapp-vue/src/main.ts:28-30`
- Modify: `webapp-vue/index.html`

**Interfaces:**
- Consumes: everything registered in Tasks 1, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Reorder install / isReady / mount**

In `webapp-vue/src/main.ts`, replace the `.finally(...)` block at the end:

```ts
  .finally(() => {
    // router.isReady() only settles once the initial navigation has run, and that is
    // kicked off by router.install() — so the router must be installed on the app
    // BEFORE awaiting it, or this hangs forever. Mounting afterwards means the first
    // paint already carries the resolved community instead of flashing the app name.
    const app = createApp(App).use(router)
    router
      .isReady()
      .catch((err: unknown) => console.error('[router] initial navigation failed:', err))
      .finally(() => app.mount('#app'))
  })
```

- [ ] **Step 2: Add the boot placeholder**

In `webapp-vue/index.html`, add a `<style>` block inside `<head>`:

```html
    <style>
      /* The app now resolves its first route before mounting, so #app is empty for a
         moment longer. Paint the header bar and the page background up front rather
         than flashing white. `:empty` stops applying the instant Vue mounts. */
      body {
        margin: 0;
        background: #f5f5f4; /* neutral-100 */
      }
      #app:empty::before {
        content: '';
        display: block;
        height: 3rem; /* header: py-3 (2 x 0.75rem) + a 1.5rem line box */
        background: #1c1917; /* stone-900 */
      }
    </style>
```

- [ ] **Step 3: Verify the suite and the types**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass (`main.ts` and `index.html` are not unit-tested; this guards against a typo).

- [ ] **Step 4: Verify in the browser**

Start the dev server via the preview tooling (`.claude/launch.json` entry, or create one running `pnpm dev` on port 5173 — never `pnpm dev` through Bash), with the backend running on :8080. Then:

1. Log in and land on a community.
2. Reload the page directly on `/<slug>/` — the header must read the community name at the first paint, never "countdown".
3. Click the community name in the header — nothing may change on screen.
4. Switch to another community from the community menu — the old page stays until the new one is ready; no "Lade…" appears.

Capture a screenshot of step 2 as evidence.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/main.ts webapp-vue/index.html
git commit -m "fix(web): resolve the initial route before mounting the app"
```

---

### Task 6: Stop blocking the community switch on `setSelection`

`go()` awaits a round-trip before anything moves. The guard now persists the selection after the commit, so this is both redundant and a delay.

**Files:**
- Modify: `webapp-vue/src/communities/CommunityMenu.vue:32-40`
- Modify: `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts:103-118`

**Interfaces:**
- Consumes: the `setSelection` call inside `registerCommunityDataGuard` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Replace the two selection tests**

In `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts`, replace the two cases
`'remembers the selection before navigating to another community'` and
`'navigates even when the selection cannot be persisted'` with:

```ts
  it('navigates to the other community without waiting on a round-trip', async () => {
    // The selection is persisted by the router guard after the navigation commits;
    // awaiting it here would delay every switch by a request.
    const select = vi.spyOn(api, 'setSelection')
    const w = await open(admin)
    await w.find('[data-test=switch-community]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/nord/')
    expect(select).not.toHaveBeenCalled()
  })
```

Note the deliberately missing `await flushPromises()` before the assertion: the push must
already have happened synchronously on click.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/CommunityMenu.spec.ts`
Expected: FAIL — `setSelection` was called, and `push` has not happened yet at assertion time.

- [ ] **Step 3: Simplify `go()`**

In `webapp-vue/src/communities/CommunityMenu.vue`, replace the `go` function:

```ts
function go(c: CommunitySummary): void {
  router.push(`/${c.slug}/`).catch((e) => console.error('navigation failed', e))
}
```

and drop `setSelection` from the imports — the file then imports nothing from `@/api/communities`, so remove that import line entirely.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/CommunityMenu.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify the suite, types and lint**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass. `pnpm lint` is what catches a leftover unused import here.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/communities/CommunityMenu.vue webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts
git commit -m "perf(web): navigate immediately when switching community"
```

---

### Task 7: Feed the learnings back into the guidelines

Required by [`.claude/guidelines/feeding-knowledge-back.md`](../../../.claude/guidelines/feeding-knowledge-back.md): every task ends by capturing what a future contributor would otherwise rediscover.

**Files:**
- Modify: `.claude/guidelines/frontend.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Read the current text**

Read `.claude/guidelines/frontend.md` § *Routing*, § *Community context + admin gating* (the
bullet claiming "The shell … fetches the community"), and the **App-level header state**
paragraph (which says `activeCommunity` is "set by the shell on resolve, cleared on unmount").
Both statements become false with this change.

- [ ] **Step 2: Correct the two stale statements**

- In § *Community context + admin gating*, change the first bullet so the shell is described as
  rendering `communityRoute` from `src/communities/routeData.ts`, which the router guard resolves
  before the route commits. Keep the existing note about the `as unknown as Readonly<Ref<…>>`
  bridge — it still applies.
- In the **App-level header state** paragraph, replace "set by the shell on resolve, cleared on
  unmount" with: written by `registerCommunityDataGuard`'s `afterEach` and by the shell's
  `refresh()`, both through the single `publishCommunity()` helper. Keep the existing rule that
  every path loading the community must republish it.

- [ ] **Step 3: Add a "Navigation data" subsection under § Routing**

Capture what is genuinely non-obvious and cost time here:

- Resolve route data in `beforeResolve` and publish it in `afterEach`. Writing during
  `beforeResolve` lets an aborted navigation leave state describing a route the user never
  reached; writing in `afterEach` makes the header match the committed route by construction.
- `afterEach` fires for failed navigations too and receives the `failure` argument — check it.
  Skipping failures is exactly what turns a redirect back to the current route into a true no-op.
- Never clear app-global route state from `onUnmounted`. ~~Vue mounts the incoming component
  before unmounting the outgoing one, so the departing component's hook runs last and overwrites
  the new value.~~ **Correction (2026-08-02, this branch's final review):** that ordering claim is
  false — `unmounted` runs *first*, verified twice against this repo's Vue (a bare `<component
  :is>` swap and a real `RouterView` route swap both log `["Shell unmounted","Index mounted"]`).
  The rule stands, the reason is different: a teardown hook fires on the way out with no knowledge
  of what the destination needs, and clears the value a full async round-trip before the incoming
  route could restore it. **Do not copy the struck-through sentence forward** — it reached
  `frontend.md` from this plan and had to be corrected there. Ownership belongs to the router, not
  to a component lifecycle.
- `router.isReady()` only settles once the initial navigation runs, and that is started by
  `router.install()`. Awaiting it before `app.use(router)` deadlocks. Order:
  `createApp(App).use(router)` → `await router.isReady()` → `app.mount()`.
- Guard async loads with a generation counter so a superseded navigation cannot publish its
  result (the same technique `useCountdown` uses for stale responses).
- A pending indicator needs a delay (~150 ms). An indicator that flashes on a fast transition is
  itself the flicker it was added to explain.

- [ ] **Step 4: Commit**

```bash
git add .claude/guidelines/frontend.md
git commit -m "docs(web): record the resolve-before-commit navigation conventions"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: root cause 1 → Task 4; root cause 2 → Tasks 2+3; root cause 3 → Task 2 (`afterEach` ownership) + Task 3 (removing `onUnmounted`); `beforeResolve`/`afterEach` architecture → Task 2; module state + shell contract → Tasks 2+3; pending indicator → Task 1; cold start → Task 5; error handling → Tasks 2 (404/500) and 4 (landing failure) and 6 (`setSelection`); the file table → Tasks 1–6; the testing section → the spec files in Tasks 1–4 and 6. The spec's non-goals (no caching, no transitions, `useCommunityContext()` unchanged) are respected throughout.

**Deliberate deviation.** `navigationPending` lives in `src/ui/navigationProgress.ts` rather than in `routeData.ts` — noted in the File Structure section above.

**Naming consistency.** `communityRoute`, `publishCommunity`, `registerCommunityDataGuard`, `_resetRouteDataState`, `landingFailed`, `resolveLandingTarget`, `registerLandingRedirect`, `_resetLandingState`, `navigationPending`, `PENDING_DELAY_MS`, `registerNavigationProgress`, `_resetNavigationProgressState` are each defined once and used under exactly that name everywhere else.
