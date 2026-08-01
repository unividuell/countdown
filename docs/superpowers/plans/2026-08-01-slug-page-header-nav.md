# Slug-Page Header Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every navigation control out of the `/[slug]` content area into two icon menus in the app-wide main header — a community menu on the far left, a member menu on the far right.

**Architecture:** One shared dropdown primitive (`src/ui/HeaderMenu.vue`) carries the open/close mechanics for both menus. `App.vue` gates both: the community menu renders only when the module-level `activeCommunity` ref is set, the member menu only when the viewer is authenticated. The `/[slug]` shell publishes `viewerIsAdmin` + `pendingCount` into `activeCommunity` so the header — which sits above the `[slug]` provide/inject tree — can read them.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">` · Vue Router 5 (file-based) · Tailwind v4 · VueUse · Vitest + @vue/test-utils + happy-dom · unplugin-icons + `@iconify-json/lucide` · pnpm.

**Spec:** `docs/superpowers/specs/2026-08-01-slug-page-header-nav-design.md`

## Global Constraints

- All work happens in `webapp-vue/`. **No backend change** — `CommunityResponse` already carries `viewerIsAdmin` and `pendingCount`.
- **No new runtime dependencies.** `unplugin-icons` and `@iconify-json/lucide` are **devDependencies**; icons are bundled at build time.
- TypeScript is very strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. `pnpm typecheck` must stay green.
- Mocking uses Vitest `vi` — never mockk/kotest (that is the Kotlin backend's convention).
- UI copy is **German**: `Anfragen`, `Mitglieder`, `Einstellungen`, `Spielgemeinschaft erstellen`, `Abmelden`, `Abmelden fehlgeschlagen`.
- Icon components render with `width/height: 1em` and `currentColor` — size them with Tailwind (`class="size-5"`), never with hardcoded colours.
- Never leave an unhandled promise rejection in a click handler.
- Every task ends with a commit. Run `pnpm format` before committing if Prettier would reformat touched files.
- Working directory for all commands: `webapp-vue/`.

## File Structure

| File | Responsibility |
| --- | --- |
| `vite.config.ts`, `vitest.config.ts`, `env.d.ts` | wire `unplugin-icons` into build, tests and typecheck |
| `src/__tests__/icons.spec.ts` (new) | guards that `~icons/*` resolves in the test environment |
| `src/ui/HeaderMenu.vue` (new) | dropdown mechanics: open state, outside click, Escape, route change, ARIA |
| `src/communities/context.ts` | `ActiveCommunity` gains `viewerIsAdmin` + `pendingCount` |
| `src/pages/[slug].vue` | publishes the community into `activeCommunity` from both `resolve()` and `refresh()`; content area shrinks to `<RouterView />` |
| `src/communities/CommunityMenu.vue` (new) | community icon, pending dot, admin block, community list, create action |
| `src/auth/MemberMenu.vue` (new) | member icon, username, logout |
| `src/App.vue` | header layout: two flex groups, gates both menus |
| `src/communities/CommunitySwitcher.vue` | deleted — absorbed into `CommunityMenu` |
| `src/pages/communities/index.vue` | loses its logout button |
| `src/pages/[slug]/index.vue` | loses its welcome sentence |
| `.claude/guidelines/frontend.md` | icon convention + the `activeCommunity` republish rule |

---

### Task 1: Bundle Lucide icons at build time

**Files:**
- Modify: `webapp-vue/package.json` (via pnpm)
- Modify: `webapp-vue/vite.config.ts`
- Modify: `webapp-vue/vitest.config.ts`
- Modify: `webapp-vue/env.d.ts`
- Test: `webapp-vue/src/__tests__/icons.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: virtual modules `~icons/lucide/users`, `~icons/lucide/circle-user`, `~icons/lucide/plus`, each a Vue functional component rendering an inline `<svg>` sized `1em` and filled with `currentColor`.

The two Vite configs are **separate files**. Forgetting the plugin in `vitest.config.ts` is the failure mode this task's test exists to catch.

- [ ] **Step 1: Install the dev dependencies**

```bash
cd webapp-vue && pnpm add -D unplugin-icons @iconify-json/lucide
```

- [ ] **Step 2: Write the failing test**

Create `webapp-vue/src/__tests__/icons.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IconUsers from '~icons/lucide/users'

describe('icon bundling', () => {
  it('renders a Lucide icon as an inline svg', () => {
    const w = mount(IconUsers)
    expect(w.element.tagName.toLowerCase()).toBe('svg')
  })

  it('inherits colour and size from the surrounding text', () => {
    const w = mount(IconUsers)
    expect(w.attributes('width')).toBe('1em')
    expect(w.html()).toContain('currentColor')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/__tests__/icons.spec.ts`
Expected: FAIL — Vitest cannot resolve the import `~icons/lucide/users`.

- [ ] **Step 4: Add the plugin to the Vite build config**

In `webapp-vue/vite.config.ts`, add the import and the plugin entry (order relative to `VueRouter()`/`vue()` does not matter for icons, but `VueRouter()` must stay first):

```ts
import Icons from 'unplugin-icons/vite'
```

```ts
  plugins: [
    VueRouter(), // ⚠️ must come before vue()
    vue(),
    Icons({ compiler: 'vue3' }),
    tailwindcss(),
  ],
```

- [ ] **Step 5: Add the plugin to the Vitest config**

In `webapp-vue/vitest.config.ts`:

```ts
import Icons from 'unplugin-icons/vite'
```

```ts
  plugins: [vue(), Icons({ compiler: 'vue3' })],
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/__tests__/icons.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Teach vue-tsc about the virtual modules**

Append to `webapp-vue/env.d.ts` (it currently holds only the `vite/client` reference):

```ts
/// <reference types="unplugin-icons/types/vue" />
```

- [ ] **Step 8: Verify the typecheck passes**

Run: `cd webapp-vue && pnpm typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add webapp-vue/package.json webapp-vue/pnpm-lock.yaml webapp-vue/vite.config.ts webapp-vue/vitest.config.ts webapp-vue/env.d.ts webapp-vue/src/__tests__/icons.spec.ts
git commit -m "build(webapp): bundle Lucide icons via unplugin-icons"
```

---

### Task 2: HeaderMenu — the shared dropdown primitive

**Files:**
- Create: `webapp-vue/src/ui/HeaderMenu.vue`
- Test: `webapp-vue/src/ui/__tests__/HeaderMenu.spec.ts` (create)

**Interfaces:**
- Consumes: `useRoute` from `vue-router`; `onClickOutside`, `onKeyStroke` from `@vueuse/core`.
- Produces: component `HeaderMenu` with props `{ label: string; align?: 'left' | 'right' }` (`align` defaults to `'left'`), slot `trigger` (button content) and the default slot (panel content). Attributes fall through to the root `<div>`.

`src/ui/` is a new directory for shared UI primitives; feature folders (`communities/`, `auth/`) stay as they are.

The panel deliberately does **not** close on clicks inside it. Every navigating entry changes the route, and the route watcher closes the menu; a non-navigating action (a failed logout) must be able to keep the panel open to show its error.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/ui/__tests__/HeaderMenu.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ fullPath: '/team/' })
  return { useRoute: () => route, __route: route }
})

// The mocked module exposes the same reactive object the component sees.
const { __route: route } = (await import('vue-router')) as unknown as {
  __route: { fullPath: string }
}

const mountMenu = async () => {
  const HeaderMenu = (await import('@/ui/HeaderMenu.vue')).default
  return mount(HeaderMenu, {
    attachTo: document.body,
    props: { label: 'Test-Menü' },
    slots: { trigger: '<span>icon</span>', default: '<a href="#">Eintrag</a>' },
  })
}

describe('HeaderMenu', () => {
  it('is closed initially and toggles on trigger clicks', async () => {
    const w = await mountMenu()
    expect(w.find('[role=menu]').exists()).toBe(false)
    await w.find('button').trigger('click')
    expect(w.find('[role=menu]').exists()).toBe(true)
    await w.find('button').trigger('click')
    expect(w.find('[role=menu]').exists()).toBe(false)
  })

  it('exposes its state to assistive technology', async () => {
    const w = await mountMenu()
    const trigger = w.find('button')
    expect(trigger.attributes('aria-label')).toBe('Test-Menü')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.find('[role=menu]').exists()).toBe(false)
    expect(document.activeElement).toBe(w.find('button').element)
  })

  it('closes on a click outside', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    outside.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()
    expect(w.find('[role=menu]').exists()).toBe(false)
  })

  it('closes when the route changes', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    route.fullPath = '/other/'
    await nextTick()
    expect(w.find('[role=menu]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/HeaderMenu.spec.ts`
Expected: FAIL — cannot resolve `@/ui/HeaderMenu.vue`.

- [ ] **Step 3: Write the component**

Create `webapp-vue/src/ui/HeaderMenu.vue`:

```vue
<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { useRoute } from 'vue-router'

withDefaults(defineProps<{ label: string; align?: 'left' | 'right' }>(), { align: 'left' })

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const route = useRoute()

onClickOutside(root, () => {
  open.value = false
})
onKeyStroke('Escape', () => {
  if (!open.value) return
  open.value = false
  trigger.value?.focus()
})
// Every navigating entry closes the menu this way, which is why clicks inside
// the panel are not wired to close: a failed logout has to keep it open.
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="flex items-center rounded p-1 hover:bg-stone-800"
      @click="open = !open"
    >
      <slot name="trigger" />
    </button>
    <div
      v-if="open"
      role="menu"
      class="absolute z-20 mt-1 w-56 rounded border bg-white py-1 text-neutral-900 shadow"
      :class="align === 'right' ? 'right-0' : 'left-0'"
    >
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/HeaderMenu.spec.ts`
Expected: PASS (5 tests).

If the outside-click case fails because happy-dom's event shim does not satisfy VueUse's `onClickOutside`, replace that one call with an explicit listener — the test stays exactly as written:

```ts
import { useEventListener } from '@vueuse/core'

useEventListener(document, 'click', (e: Event) => {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false
})
```

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/HeaderMenu.vue webapp-vue/src/ui/__tests__/HeaderMenu.spec.ts
git commit -m "feat(webapp): add HeaderMenu dropdown primitive"
```

---

### Task 3: Publish viewerIsAdmin + pendingCount into activeCommunity

**Files:**
- Modify: `webapp-vue/src/communities/context.ts:13-19`
- Modify: `webapp-vue/src/pages/[slug].vue:19-39`
- Modify: `webapp-vue/src/__tests__/app-header.spec.ts` (fixtures gain two fields)
- Test: `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`

**Interfaces:**
- Consumes: `CommunityResponse` from `@/api/types`.
- Produces: `ActiveCommunity` with the shape `{ slug: string; name: string; startsAt: string | null; startsAtTimezone: string; viewerIsAdmin: boolean; pendingCount: number }`. Later tasks read exactly these names.

`refresh()` currently updates only `community.value`. Without this change the pending dot would keep showing after an admin has cleared the requests on `/[slug]/requests`.

The `/[slug]` local header stays untouched in this task — it is removed in Task 7.

- [ ] **Step 1: Write the failing tests**

Replace the `vi.mock('vue-router', …)` block at the top of `webapp-vue/src/pages/__tests__/slug-shell.spec.ts` with one whose `RouterView` reaches into the provided context, so the test can trigger `refresh()`:

```ts
vi.mock('vue-router', async () => {
  const { defineComponent, inject } = await import('vue')
  const { communityKey } = await import('@/communities/context')
  return {
    useRoute: () => ({ params: { slug: 'team' } }),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
```

Add these two cases to the same file:

```ts
  it('publishes the admin flag and pending count into activeCommunity', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 3,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    mount(Shell)
    await flushPromises()
    expect(activeCommunity.value).toMatchObject({
      slug: 'team',
      name: 'Team',
      viewerIsAdmin: true,
      pendingCount: 3,
    })
  })

  it('republishes activeCommunity when the context is refreshed', async () => {
    const get = vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 3,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    get.mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
    })
    await w.find('[data-test=do-refresh]').trigger('click')
    await flushPromises()
    expect(activeCommunity.value?.pendingCount).toBe(0)
  })
```

Add the import at the top of the file:

```ts
import { activeCommunity } from '@/communities/context'
```

and reset it between cases inside the existing `beforeEach`:

```ts
    activeCommunity.value = null
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/slug-shell.spec.ts`
Expected: FAIL — `activeCommunity` has no `viewerIsAdmin`/`pendingCount`, and the refresh case still reports `3`.

- [ ] **Step 3: Extend the ActiveCommunity type**

In `webapp-vue/src/communities/context.ts`:

```ts
export interface ActiveCommunity {
  slug: string
  name: string
  startsAt: string | null
  startsAtTimezone: string
  viewerIsAdmin: boolean
  pendingCount: number
}
```

- [ ] **Step 4: Route both load paths through one publish() helper**

In `webapp-vue/src/pages/[slug].vue`, replace `resolve()` and `refresh()` with:

```ts
function publish(c: CommunityResponse): void {
  community.value = c
  activeCommunity.value = {
    slug: c.slug,
    name: c.name,
    startsAt: c.startsAt,
    startsAtTimezone: c.startsAtTimezone,
    viewerIsAdmin: c.viewerIsAdmin,
    pendingCount: c.pendingCount,
  }
}

async function resolve(slug: string): Promise<void> {
  state.value = 'loading'
  try {
    const c = await getCommunity(slug)
    publish(c)
    state.value = 'ready'
    void setSelection(c.id)
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'error'
    community.value = null
    activeCommunity.value = null
  }
}
async function refresh(): Promise<void> {
  if (community.value) publish(await getCommunity(community.value.slug))
}
```

- [ ] **Step 5: Update the header-spec fixtures**

`ActiveCommunity` now has two more required fields, so the three fixtures in `webapp-vue/src/__tests__/app-header.spec.ts` need them. Add `viewerIsAdmin: false,` and `pendingCount: 0,` to each `activeCommunity.value = { … }` assignment in that file.

- [ ] **Step 6: Run the whole suite and the typecheck**

Run: `cd webapp-vue && pnpm test && pnpm typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/communities/context.ts "webapp-vue/src/pages/[slug].vue" webapp-vue/src/pages/__tests__/slug-shell.spec.ts webapp-vue/src/__tests__/app-header.spec.ts
git commit -m "feat(webapp): publish admin flag and pending count to the header state"
```

---

### Task 4: CommunityMenu

**Files:**
- Create: `webapp-vue/src/communities/CommunityMenu.vue`
- Test: `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts` (create)

**Interfaces:**
- Consumes: `HeaderMenu` (Task 2); `ActiveCommunity` (Task 3); `useCommunities()` → `{ active: Ref<CommunitySummary[]>, refresh: () => Promise<void> }`; `setSelection(communityId: string): Promise<void>` from `@/api/communities`.
- Produces: component `CommunityMenu` with prop `{ community: ActiveCommunity }`. The caller decides whether it renders at all.

Taking the community as a **prop** (instead of reading the module ref internally) keeps the component non-nullable under strict TS and makes it mountable in isolation.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import type { ActiveCommunity } from '@/communities/context'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  return {
    useRoute: () => reactive({ fullPath: '/team/' }),
    useRouter: () => ({ push: pushMock, replace: vi.fn() }),
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  }
})

const admin: ActiveCommunity = {
  slug: 'team',
  name: 'Team Süd',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  viewerIsAdmin: true,
  pendingCount: 2,
}

async function open(community: ActiveCommunity) {
  const Cmp = (await import('@/communities/CommunityMenu.vue')).default
  const w = mount(Cmp, { props: { community } })
  await flushPromises()
  await w.find('button').trigger('click')
  return w
}

describe('CommunityMenu', () => {
  beforeEach(() => {
    pushMock.mockClear()
    vi.spyOn(api, 'listCommunities').mockResolvedValue([
      { id: '1', name: 'Team Süd', slug: 'team' },
      { id: '2', name: 'Team Nord', slug: 'nord' },
    ])
  })

  it('heads the admin block with the community name and links the three admin pages', async () => {
    const w = await open(admin)
    const menu = w.find('[role=menu]')
    expect(menu.text()).toContain('Team Süd')
    expect(menu.text()).toContain('Anfragen')
    expect(menu.text()).toContain('2') // pending count next to Anfragen
    expect(menu.find('a[href="/team/requests"]').exists()).toBe(true)
    expect(menu.find('a[href="/team/members"]').exists()).toBe(true)
    expect(menu.find('a[href="/team/settings"]').exists()).toBe(true)
  })

  it('shows neither heading nor admin links to a non-admin', async () => {
    const w = await open({ ...admin, viewerIsAdmin: false, pendingCount: 0 })
    const menu = w.find('[role=menu]')
    expect(menu.text()).not.toContain('Anfragen')
    expect(menu.text()).not.toContain('Einstellungen')
    expect(menu.text()).not.toContain('Team Süd')
  })

  it('shows the pending dot only for an admin with open requests', async () => {
    expect((await open(admin)).find('[data-test=pending-dot]').exists()).toBe(true)
    expect(
      (await open({ ...admin, pendingCount: 0 })).find('[data-test=pending-dot]').exists(),
    ).toBe(false)
    expect(
      (await open({ ...admin, viewerIsAdmin: false })).find('[data-test=pending-dot]').exists(),
    ).toBe(false)
  })

  it('carries the pending signal in the trigger label, since the dot is aria-hidden', async () => {
    expect((await open(admin)).find('[data-test=pending-dot]').attributes('aria-hidden')).toBe(
      'true',
    )
    expect((await open(admin)).find('button').attributes('aria-label')).toBe(
      'Community-Menü, offene Anfragen',
    )
    expect((await open({ ...admin, pendingCount: 0 })).find('button').attributes('aria-label')).toBe(
      'Community-Menü',
    )
  })

  it('lists the other communities but not the current one', async () => {
    const w = await open(admin)
    const entries = w.findAll('[data-test=switch-community]')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.text()).toBe('Team Nord')
  })

  it('offers the create action', async () => {
    const w = await open(admin)
    expect(w.find('[data-test=create-community]').attributes('href')).toBe('/communities/new')
  })

  it('remembers the selection before navigating to another community', async () => {
    const select = vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const w = await open(admin)
    await w.find('[data-test=switch-community]').trigger('click')
    await flushPromises()
    expect(select).toHaveBeenCalledWith('2')
    expect(pushMock).toHaveBeenCalledWith('/nord/')
  })

  it('navigates even when the selection cannot be persisted', async () => {
    vi.spyOn(api, 'setSelection').mockRejectedValue(new Error('offline'))
    const w = await open(admin)
    await w.find('[data-test=switch-community]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith('/nord/')
  })

  it('stays usable when the community list cannot be loaded', async () => {
    vi.spyOn(api, 'listCommunities').mockRejectedValue(new Error('offline'))
    const w = await open(admin)
    expect(w.findAll('[data-test=switch-community]')).toHaveLength(0)
    expect(w.find('[data-test=create-community]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/CommunityMenu.spec.ts`
Expected: FAIL — cannot resolve `@/communities/CommunityMenu.vue`.

- [ ] **Step 3: Write the component**

Create `webapp-vue/src/communities/CommunityMenu.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import IconUsers from '~icons/lucide/users'
import IconPlus from '~icons/lucide/plus'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import type { ActiveCommunity } from '@/communities/context'
import type { CommunitySummary } from '@/api/types'
import { useCommunities } from '@/communities/useCommunities'
import { setSelection } from '@/api/communities'

const props = defineProps<{ community: ActiveCommunity }>()
const router = useRouter()
const { active, refresh } = useCommunities()

onMounted(() => {
  // A failed list leaves the admin block and the create action working.
  refresh().catch((e) => console.error('could not load the community list', e))
})

const others = computed(() => active.value.filter((c) => c.slug !== props.community.slug))
const showDot = computed(() => props.community.viewerIsAdmin && props.community.pendingCount > 0)
const label = computed(() =>
  showDot.value ? 'Community-Menü, offene Anfragen' : 'Community-Menü',
)

const ENTRY = 'block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100'

async function go(c: CommunitySummary): Promise<void> {
  // The selection is only a "last visited" marker — losing it must not block the navigation.
  try {
    await setSelection(c.id)
  } catch (e) {
    console.error('could not persist the community selection', e)
  }
  router.push(`/${c.slug}/`)
}
</script>

<template>
  <HeaderMenu :label="label" data-test="community-menu">
    <template #trigger>
      <span class="relative flex">
        <IconUsers class="size-5" />
        <span
          v-if="showDot"
          data-test="pending-dot"
          aria-hidden="true"
          class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-stone-900 bg-blue-600"
        />
      </span>
    </template>

    <template v-if="community.viewerIsAdmin">
      <div class="px-3 pt-1 pb-0.5 text-xs text-neutral-500">{{ community.name }}</div>
      <RouterLink :to="`/${community.slug}/requests`" :class="ENTRY">
        Anfragen
        <span v-if="community.pendingCount > 0">({{ community.pendingCount }})</span>
      </RouterLink>
      <RouterLink :to="`/${community.slug}/members`" :class="ENTRY">Mitglieder</RouterLink>
      <RouterLink :to="`/${community.slug}/settings`" :class="ENTRY">Einstellungen</RouterLink>
      <div class="my-1 border-t border-neutral-200" />
    </template>

    <button
      v-for="c in others"
      :key="c.id"
      type="button"
      data-test="switch-community"
      :class="ENTRY"
      @click="go(c)"
    >
      {{ c.name }}
    </button>

    <RouterLink
      to="/communities/new"
      data-test="create-community"
      :class="`${ENTRY} flex items-center gap-2 text-neutral-600`"
    >
      <IconPlus class="size-4" />
      Spielgemeinschaft erstellen
    </RouterLink>
  </HeaderMenu>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/communities/__tests__/CommunityMenu.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/communities/CommunityMenu.vue webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts
git commit -m "feat(webapp): add the community header menu"
```

---

### Task 5: MemberMenu

**Files:**
- Create: `webapp-vue/src/auth/MemberMenu.vue`
- Test: `webapp-vue/src/auth/__tests__/MemberMenu.spec.ts` (create)

**Interfaces:**
- Consumes: `HeaderMenu` (Task 2); `useAuth()` → `{ user: Readonly<Ref<MeResponse | null>>, logout: () => Promise<void>, … }`.
- Produces: component `MemberMenu`, no props. The caller decides whether it renders at all.

`useAuth.logout()` deliberately keeps local auth state when the server call fails, because the session may still be alive — so a failure must surface, not disappear.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/auth/__tests__/MemberMenu.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useAuth } from '@/auth/useAuth'

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  return {
    useRoute: () => reactive({ fullPath: '/team/' }),
    useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  }
})
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

function mockAuth(logout: () => Promise<void>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { value: { username: 'clemens' } } as never,
    status: { value: 'authenticated' } as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout,
    markAnonymous: vi.fn(),
  })
}

async function open() {
  const Cmp = (await import('@/auth/MemberMenu.vue')).default
  const w = mount(Cmp)
  await w.find('button').trigger('click')
  return w
}

describe('MemberMenu', () => {
  beforeEach(() => replaceMock.mockClear())

  it('shows the username without linking anywhere', async () => {
    mockAuth(vi.fn().mockResolvedValue(undefined))
    const w = await open()
    expect(w.find('[data-test=current-user]').text()).toBe('clemens')
    expect(w.find('[data-test=current-user]').element.tagName.toLowerCase()).not.toBe('a')
  })

  it('logs out and sends the viewer to the login page', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockAuth(logout)
    const w = await open()
    await w.find('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(logout).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith('/login')
  })

  it('surfaces a failed logout instead of navigating away', async () => {
    mockAuth(vi.fn().mockRejectedValue(new Error('server down')))
    const w = await open()
    await w.find('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test=logout-error]').text()).toContain('Abmelden fehlgeschlagen')
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/auth/__tests__/MemberMenu.spec.ts`
Expected: FAIL — cannot resolve `@/auth/MemberMenu.vue`.

- [ ] **Step 3: Write the component**

Create `webapp-vue/src/auth/MemberMenu.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconMember from '~icons/lucide/circle-user'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import { useAuth } from '@/auth/useAuth'

const router = useRouter()
const { user, logout } = useAuth()
const failed = ref(false)

async function handleLogout(): Promise<void> {
  failed.value = false
  try {
    await logout()
  } catch (e) {
    // useAuth keeps local auth state on failure — the session may still be alive.
    console.error('logout failed', e)
    failed.value = true
    return
  }
  router.replace('/login')
}
</script>

<template>
  <HeaderMenu label="Konto-Menü" align="right" data-test="member-menu">
    <template #trigger><IconMember class="size-5" /></template>

    <div data-test="current-user" class="px-3 pt-1 pb-0.5 text-xs text-neutral-500">
      {{ user?.username }}
    </div>
    <button
      type="button"
      data-test="logout"
      class="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100"
      @click="handleLogout"
    >
      Abmelden
    </button>
    <p v-if="failed" data-test="logout-error" class="px-3 py-1 text-xs text-red-600">
      Abmelden fehlgeschlagen
    </p>
  </HeaderMenu>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd webapp-vue && pnpm test src/auth/__tests__/MemberMenu.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/auth/MemberMenu.vue webapp-vue/src/auth/__tests__/MemberMenu.spec.ts
git commit -m "feat(webapp): add the member header menu"
```

---

### Task 6: Wire both menus into the main header

**Files:**
- Modify: `webapp-vue/src/App.vue:22-29`
- Test: `webapp-vue/src/__tests__/app-header.spec.ts`

**Interfaces:**
- Consumes: `CommunityMenu` with prop `community` (Task 4), `MemberMenu` (Task 5), `useAuth().status`.
- Produces: the finished header — community menu and brand on the left, countdown and member menu on the right.

- [ ] **Step 1: Write the failing tests**

In `webapp-vue/src/__tests__/app-header.spec.ts`, add the auth mock below the existing imports:

```ts
import { useAuth } from '@/auth/useAuth'

vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

function mockStatus(status: 'unknown' | 'authenticated' | 'anonymous') {
  vi.mocked(useAuth).mockReturnValue({
    user: { value: null } as never,
    status: { value: status } as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: vi.fn(),
    markAnonymous: vi.fn(),
  })
}
```

Extend the stubs object with the two menus and add `vi` to the `vitest` import:

```ts
  CommunityMenu: { template: '<div data-test="community-menu" />', props: ['community'] },
  MemberMenu: { template: '<div data-test="member-menu" />' },
```

Default the auth state in the existing `beforeEach`:

```ts
    mockStatus('anonymous')
```

Then add:

```ts
  it('shows the community menu only inside a community', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=community-menu]').exists()).toBe(
      false,
    )
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    expect(mount(App, { global: { stubs } }).find('[data-test=community-menu]').exists()).toBe(true)
  })

  it('shows the member menu only for an authenticated viewer', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=member-menu]').exists()).toBe(false)
    mockStatus('authenticated')
    expect(mount(App, { global: { stubs } }).find('[data-test=member-menu]').exists()).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp-vue && pnpm test src/__tests__/app-header.spec.ts`
Expected: FAIL — neither menu is rendered by `App.vue`.

- [ ] **Step 3: Rebuild the header**

In `webapp-vue/src/App.vue`, add to `<script setup>`:

```ts
import { useAuth } from '@/auth/useAuth'
import CommunityMenu from '@/communities/CommunityMenu.vue'
import MemberMenu from '@/auth/MemberMenu.vue'

const { status } = useAuth()
```

and replace the `<header>` element with:

```vue
    <header class="flex items-center justify-between gap-4 bg-stone-900 px-4 py-3 text-stone-50">
      <div class="flex items-center gap-2">
        <CommunityMenu v-if="activeCommunity" :community="activeCommunity" />
        <RouterLink to="/" class="font-semibold hover:underline"
          >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
        >
      </div>
      <div class="flex items-center gap-3">
        <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
        <MemberMenu v-if="status === 'authenticated'" />
      </div>
    </header>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp-vue && pnpm test src/__tests__/app-header.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/App.vue webapp-vue/src/__tests__/app-header.spec.ts
git commit -m "feat(webapp): mount the community and member menus in the main header"
```

---

### Task 7: Empty the content area

**Files:**
- Modify: `webapp-vue/src/pages/[slug].vue` (template + now-unused script bindings)
- Delete: `webapp-vue/src/communities/CommunitySwitcher.vue`
- Modify: `webapp-vue/src/pages/communities/index.vue`
- Modify: `webapp-vue/src/pages/[slug]/index.vue`
- Test: `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`

**Interfaces:**
- Consumes: the header menus from Task 6 — every control removed here now lives there.
- Produces: a `/[slug]` shell whose ready branch is nothing but `<RouterView />`.

- [ ] **Step 1: Move the shell's UI tests to their new homes**

In `webapp-vue/src/pages/__tests__/slug-shell.spec.ts`, delete these three cases — they are covered by `CommunityMenu.spec.ts`, `MemberMenu.spec.ts` and `app-header.spec.ts` now:

- `renders a logout control and clicking it calls logout()`
- `shows the ⚙ admin menu with a pending badge only for admins`
- `hides the ⚙ admin menu for non-admins`

Rewrite the first case, which asserted on header text that no longer exists:

```ts
  it('renders the child route when an active member', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: false,
      pendingCount: 0,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.find('[data-test=do-refresh]').exists()).toBe(true)
    expect(activeCommunity.value?.name).toBe('Team')
  })
```

Add a case that pins the requirement:

```ts
  it('renders no community chrome in the content area', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 2,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell)
    await flushPromises()
    expect(w.find('header').exists()).toBe(false)
    expect(w.find('[data-test=logout]').exists()).toBe(false)
    expect(w.find('[data-test=admin-menu]').exists()).toBe(false)
    expect(w.text()).not.toContain('Team')
  })
```

Also drop the now-unused `vi.mock('@/auth/useAuth', …)` block, the `import { useAuth } from '@/auth/useAuth'` line and the `vi.mocked(useAuth).mockReturnValue({ … })` call from the `beforeEach` — keep only the `activeCommunity.value = null` reset added in Task 3.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd webapp-vue && pnpm test src/pages/__tests__/slug-shell.spec.ts`
Expected: FAIL on `renders no community chrome in the content area` — the shell still renders its own `<header>`.

- [ ] **Step 3: Strip the shell**

In `webapp-vue/src/pages/[slug].vue`, replace the whole `v-else` branch with:

```vue
  <RouterView v-else />
```

Then remove what became unused in `<script setup>`: the `adminMenuOpen` ref, the `handleLogout` function, and the imports of `RouterLink`, `useRouter`, `CommunitySwitcher` and `useAuth`. The remaining imports are `onMounted, onUnmounted, provide, ref, watch` from `vue`, `type Ref`, `RouterView, useRoute` from `vue-router`, the api functions, `ApiError`, `CommunityResponse`, and `activeCommunity, communityKey`.

- [ ] **Step 4: Delete the switcher**

```bash
git rm webapp-vue/src/communities/CommunitySwitcher.vue
```

- [ ] **Step 5: Remove the second logout button**

In `webapp-vue/src/pages/communities/index.vue`, delete the `<button data-test="logout">` element and the surrounding flex wrapper, leaving the heading:

```vue
    <h1 class="mb-4 text-xl font-semibold">Deine Spielgemeinschaften</h1>
```

Then delete `handleLogout`, the `useAuth` import, the `useRouter` import and the `router` constant from `<script setup>`; `noUnusedLocals` fails the typecheck otherwise. What remains is `onMounted`, `RouterLink`, `useCommunities` and the `onMounted(refresh)` call.

- [ ] **Step 6: Empty the community home page**

Replace the template of `webapp-vue/src/pages/[slug]/index.vue` with a comment-only template (which renders nothing, and unlike an empty template does not make Vue warn):

```vue
<script setup lang="ts">
// Community home. Per-community countdown/game content is a later spec.
</script>
<template>
  <!-- intentionally empty: the community's own content lands here in a later spec -->
</template>
```

- [ ] **Step 7: Run the whole suite plus typecheck and lint**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS, no unused-import errors.

- [ ] **Step 8: Commit**

```bash
git add -A webapp-vue/src
git commit -m "refactor(webapp): move slug-page navigation out of the content area"
```

---

### Task 8: Feed the knowledge back and verify the whole build

**Files:**
- Modify: `.claude/guidelines/frontend.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code — the project's "feeding knowledge back" ritual plus a full verification pass.

- [ ] **Step 1: Document the icon convention**

Add to the **Stack** section of `.claude/guidelines/frontend.md`, after the Luxon bullet:

```markdown
- **Icons: Lucide, bundled at build time** — `unplugin-icons` + `@iconify-json/lucide`, both
  **devDependencies**; import as `~icons/lucide/<name>`. Deliberately *not* `@iconify/vue` (the
  origin huettehuette app's choice): its `<Icon>` resolves icon data at runtime from
  `api.iconify.design`, i.e. an external request from every user's browser plus visible pop-in.
  **Gotcha:** `Icons({ compiler: 'vue3' })` must be registered in **both** `vite.config.ts` and
  `vitest.config.ts` — they are separate files, and without it `~icons/*` fails to resolve in tests.
  `vue-tsc` needs `/// <reference types="unplugin-icons/types/vue" />` in `env.d.ts`. The generated
  components render `1em`/`currentColor`, so size them with Tailwind (`class="size-5"`).
```

- [ ] **Step 2: Document the header-state rule**

Extend the **App-level header state** paragraph in the same file (in the countdown-pattern section) with:

```markdown
`ActiveCommunity` also carries `viewerIsAdmin` + `pendingCount` for the header's community menu.
**Every path that loads the community must republish it** — the shell routes both `resolve()` and
`refresh()` through one `publish(c: CommunityResponse)` helper. Publishing only on the initial
resolve leaves stale header state behind (the pending dot would survive an admin clearing the
requests). Navigation controls live in the main header (`CommunityMenu`, `MemberMenu` on top of the
shared `src/ui/HeaderMenu.vue`), never inside the `[slug]` content area.
```

- [ ] **Step 3: Run the full verification**

Run each and confirm the output before claiming success:

```bash
cd webapp-vue && pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: Prettier reports the touched files, ESLint clean, `vue-tsc` clean, all Vitest suites PASS, `vite build` succeeds.

- [ ] **Step 4: Sanity-check in the browser**

Run `cd webapp-vue && pnpm dev` against a running backend and confirm by hand: the community icon opens a menu headed by the community name with the three admin links; a dot appears when requests are pending and disappears after approving them; switching to another community navigates; the member icon shows the username and logs out; `/[slug]` shows an empty content area.

- [ ] **Step 5: Commit**

```bash
git add .claude/guidelines/frontend.md
git commit -m "docs: record the icon convention and the header-state republish rule"
```
