# Community Admin Management UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the community admin surface reachable + admin-gated: a ⚙ "Verwalten" dropdown (Anfragen[badge] · Mitglieder · Einstellungen, admin-only), a dedicated pending-requests area, invite-link management (show current link + copy + regenerate + revoke), rename + meta editing, and the community name as a home link.

**Architecture:** Small backend enrichment of the existing `community` module (expose `viewerIsAdmin` + `pendingCount` on the detail; new `GET /{slug}/invite`; tighten `GET /{slug}/members` to admin-only). The rest is frontend wiring in `webapp-vue` (shell ⚙ menu + provide/inject community context + admin route guard + requests/members/settings pages).

**Tech Stack:** Kotlin/Spring (backend) · Vue 3 + Vue Router 5 file-based + VueUse + Tailwind v4 (frontend). Tests: mockk+kotest+MockMvc DSL+Testcontainers / Vitest+`vi`.

**Spec:** `docs/superpowers/specs/2026-06-13-community-admin-ui-design.md`.

**Branch:** `feat/community-admin-ui` (already checked out).

**Current state to build on (already on this branch):** backend `CommunityController` (`get` uses `requireActiveMember`), `MemberController` (invite POST/DELETE, members uses `requireActiveMember`), `CommunityMemberRepository` (`countActiveAdmins`, `findActiveByUserId`), `CommunityResponse(id,name,slug,startsAt,phaseTwoStartRound)` + `toResponse()`. Frontend: `[slug].vue` shell (name is a `<span>`, header has switcher + logout, renders `<RouterView>` only when `state==='ready'`), `members.vue` (shows PENDING+ACTIVE inline), `settings.vue` (edit + generate-only invite), `api/communities.ts`, `api/types.ts`. Auth: `@AuthenticationPrincipal AuthenticatedUser` (`me.id`, `me.isSuperAdmin`).

---

## Phase 1 — Backend

### Task 1: pending-count repository query

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityMemberRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityMemberRepositoryTest.kt` (append a case)

- [ ] **Step 1: Add a failing test case** (append inside the existing test class)

```kotlin
    @Test
    fun `counts pending members`() {
        val admin = users.save(User(githubId = System.nanoTime(), githubLogin = "a"))
        val c = communities.save(Community(name = "Team", slug = "team-pc", createdBy = admin.id!!))
        members.save(CommunityMember(communityId = c.id!!, userId = admin.id!!, status = MemberStatus.ACTIVE, isAdmin = true))
        val p = users.save(User(githubId = System.nanoTime(), githubLogin = "p"))
        members.save(CommunityMember(communityId = c.id!!, userId = p.id!!, status = MemberStatus.PENDING))
        members.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) shouldBe 1
        members.countByCommunityIdAndStatus(c.id!!, MemberStatus.ACTIVE) shouldBe 1
    }
```
(If the existing test class lacks the `communities`/`users`/`members` autowires used above, reuse the ones it already has; the `CommunityMemberRepositoryTest` already autowires all three.)

- [ ] **Step 2: Run — expect FAIL** · `cd core && ./mvnw -q test -Dtest=CommunityMemberRepositoryTest`
- [ ] **Step 3: Implement** — add to `CommunityMemberRepository`:

```kotlin
    fun countByCommunityIdAndStatus(communityId: UUID, status: org.unividuell.countdown.core.community.MemberStatus): Long
```
(Spring Data JDBC derives this from the method name; `MemberStatus` persists as its name string, matching the existing rows.)

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): pending-member count query`

### Task 2: expose `viewerIsAdmin` + `pendingCount` on the community detail

**Files:**
- Modify: `…/community/internal/CommunityDtos.kt`
- Modify: `…/community/internal/CommunityController.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`

- [ ] **Step 1: Write/extend the failing test** — add cases to `CommunityControllerTest`:

```kotlin
    @Test
    fun `GET by slug returns viewerIsAdmin and pendingCount for an admin`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { membershipQuery.isAdmin(c.id!!, uid) } returns true
        every { memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) } returns 3
        mockMvc.get("/api/communities/team") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(true) }
            jsonPath("$.pendingCount") { value(3) }
        }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin false and pendingCount 0 for a non-admin member`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { membershipQuery.isAdmin(c.id!!, uid) } returns false
        mockMvc.get("/api/communities/team") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(false) }
            jsonPath("$.pendingCount") { value(0) }
        }
    }
```
Add a `@MockkBean lateinit var memberRepo: CommunityMemberRepository` to the test class (and import `MemberStatus`). For the super-admin case, principal(superAdmin=true) ⇒ `viewerIsAdmin` true even if `isAdmin` returns false — add a case asserting that, stubbing `requireActiveMember(uid, true, "team")`.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.** In `CommunityDtos.kt`, extend the response + the mapper:

```kotlin
data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val phaseTwoStartRound: Int?,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
)
...
fun Community.toResponse(viewerIsAdmin: Boolean, pendingCount: Int) =
    CommunityResponse(id!!, name, slug, startsAt, phaseTwoStartRound, viewerIsAdmin, pendingCount)
```

In `CommunityController.kt`, inject the repo and fix the three call sites:

```kotlin
class CommunityController(
    private val communityService: CommunityService,
    private val membershipQuery: MembershipQuery,
    private val access: CommunityAccess,
    private val selection: SelectionService,
    private val memberRepo: CommunityMemberRepository,
) {
    @PostMapping
    fun create(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(communityService.create(me.id, body.name).toResponse(viewerIsAdmin = true, pendingCount = 0))

    @GetMapping("/{slug}")
    fun get(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): CommunityResponse {
        val c = access.requireActiveMember(me.id, me.isSuperAdmin, slug)
        val isAdmin = me.isSuperAdmin || membershipQuery.isAdmin(c.id!!, me.id)
        val pending = if (isAdmin) memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING).toInt() else 0
        return c.toResponse(viewerIsAdmin = isAdmin, pendingCount = pending)
    }

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)
        val updated = communityService.update(c, body.name, body.startsAt, body.phaseTwoStartRound)
        val pending = memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING).toInt()
        return updated.toResponse(viewerIsAdmin = true, pendingCount = pending)
    }
}
```
Add imports: `org.unividuell.countdown.core.community.MemberStatus`.

- [ ] **Step 4: Run — expect PASS** (`-Dtest=CommunityControllerTest`).
- [ ] **Step 5: Commit** — `feat(community): expose viewerIsAdmin + pendingCount on detail`

### Task 3: `GET /{slug}/invite` (admin-only, current link)

**Files:**
- Modify: `…/community/internal/MemberController.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberControllerTest.kt`

- [ ] **Step 1: Write the failing test** — add to `MemberControllerTest`:

```kotlin
    @Test
    fun `GET invite returns the current link for an admin`() {
        val c = community("team").copy(inviteToken = "tok9", inviteTokenExpiresAt = Instant.parse("2030-01-01T00:00:00Z"))
        every { access.requireAdmin(uid, false, "team") } returns c
        mockMvc.get("/api/communities/team/invite") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.url") { value(org.hamcrest.Matchers.containsString("/join/tok9")) }
        }
    }

    @Test
    fun `GET invite returns 204 when there is no active link`() {
        every { access.requireAdmin(uid, false, "team") } returns community("team") // no token
        mockMvc.get("/api/communities/team/invite") { with(principal()) }.andExpect {
            status { isNoContent() }
        }
    }
```
(`community(slug)` helper already builds a `Community`; ensure it allows `.copy(...)`. `Instant` import as needed.)

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — add to `MemberController` (returns 204 when none/expired, else 200 `InviteResponse`):

```kotlin
    @GetMapping("/{slug}/invite")
    fun currentInvite(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): ResponseEntity<InviteResponse> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)
        val token = c.inviteToken
        val expiresAt = c.inviteTokenExpiresAt
        if (token == null || expiresAt == null || expiresAt.isBefore(java.time.Instant.now())) {
            return ResponseEntity.noContent().build()
        }
        val url = UriComponentsBuilder.fromPath("/join/{token}").buildAndExpand(token).toUriString()
        return ResponseEntity.ok(InviteResponse(url = url, expiresAt = expiresAt))
    }
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(community): GET current invite link (admin)`

### Task 4: tighten `GET /{slug}/members` to admin-only

**Files:**
- Modify: `…/community/internal/MemberController.kt` (the `members` method)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberControllerTest.kt`

- [ ] **Step 1: Write/adjust the failing test** — assert a non-admin active member is forbidden:

```kotlin
    @Test
    fun `GET members is forbidden for a non-admin`() {
        every { access.requireAdmin(uid, false, "team") } throws NotAdminException()
        mockMvc.get("/api/communities/team/members") { with(principal()) }.andExpect {
            status { isForbidden() }
        }
    }
```
If an existing members test stubbed `access.requireActiveMember` for the list, update it to stub `access.requireAdmin` instead.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — change the one line in `members`:

```kotlin
    @GetMapping("/{slug}/members")
    fun members(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): List<MemberResponse> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)   // was requireActiveMember
        return memberRepo.findByCommunityId(c.id!!).map { /* unchanged mapping */ ... }
    }
```

- [ ] **Step 4: Run targeted, then full backend** — `./mvnw -q test -Dtest=MemberControllerTest` then `./mvnw -q test` (all green, incl. ModularityTests).
- [ ] **Step 5: Commit** — `feat(community): restrict member roster to admins`

---

## Phase 2 — Frontend

### Task 5: API types + client (`viewerIsAdmin`, `pendingCount`, `getInvite`, `revokeInvite`)

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/api/communities.ts`
- Test: `webapp-vue/src/api/__tests__/communities.spec.ts` (append)

- [ ] **Step 1: Write the failing test** (append)

```ts
  it('gets the current invite (or null on 204)', async () => {
    apiFetch.mockResolvedValue({ url: '/join/tok', expiresAt: '2030-01-01T00:00:00Z' })
    const r = await getInvite('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/invite')
    expect(r?.url).toBe('/join/tok')
  })
  it('revokes the invite', async () => {
    apiFetch.mockResolvedValue(undefined)
    await revokeInvite('team')
    expect(apiFetch).toHaveBeenCalledWith('/api/communities/team/invite', { method: 'DELETE' })
  })
```
(Import `getInvite, revokeInvite` in the spec.)

- [ ] **Step 2: Run — expect FAIL** · `cd webapp-vue && pnpm vitest run src/api/__tests__/communities.spec.ts`
- [ ] **Step 3: Implement.** In `types.ts` extend `CommunityResponse`:

```ts
export interface CommunityResponse {
  id: string
  name: string
  slug: string
  startsAt: string | null
  phaseTwoStartRound: number | null
  viewerIsAdmin: boolean
  pendingCount: number
}
```
In `communities.ts` add:

```ts
// 204 → apiFetch returns undefined → normalize to null
export const getInvite = (slug: string) =>
  apiFetch<InviteResponse | undefined>(`/api/communities/${slug}/invite`).then((r) => r ?? null)
export const revokeInvite = (slug: string) =>
  apiFetch<void>(`/api/communities/${slug}/invite`, { method: 'DELETE' })
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): community detail role/pending fields + getInvite/revokeInvite`

### Task 6: community context (provide/inject) + shell rework

**Files:**
- Create: `webapp-vue/src/communities/context.ts`
- Modify: `webapp-vue/src/pages/[slug].vue`
- Test: `webapp-vue/src/pages/__tests__/slug-shell.spec.ts` (extend)

- [ ] **Step 1: Write the failing test** — extend `slug-shell.spec.ts`:

```ts
  it('shows the ⚙ admin menu with a pending badge only for admins, and links the name to /', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1', name: 'Team', slug: 'team', startsAt: null, phaseTwoStartRound: null,
      viewerIsAdmin: true, pendingCount: 2,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell); await flushPromises()
    expect(w.find('[data-test=admin-menu]').exists()).toBe(true)
    expect(w.text()).toContain('2') // pending badge
    expect(w.find('a[href="/"]').exists()).toBe(true) // name links home
  })

  it('hides the ⚙ admin menu for non-admins', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1', name: 'Team', slug: 'team', startsAt: null, phaseTwoStartRound: null,
      viewerIsAdmin: false, pendingCount: 0,
    })
    vi.spyOn(api, 'setSelection').mockResolvedValue(undefined as never)
    const Shell = (await import('@/pages/[slug].vue')).default
    const w = mount(Shell); await flushPromises()
    expect(w.find('[data-test=admin-menu]').exists()).toBe(false)
  })
```
The existing mock of `vue-router` in this spec stubs `RouterView`; also stub `RouterLink` (`{ template: '<a :href="to"><slot/></a>', props: ['to'] }`) so `a[href="/"]` resolves.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.** `communities/context.ts`:

```ts
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'
import type { CommunityResponse } from '@/api/types'

export interface CommunityContext {
  community: Readonly<Ref<CommunityResponse>>
  refresh: () => Promise<void>
}
export const communityKey: InjectionKey<CommunityContext> = Symbol('community')

export function useCommunityContext(): CommunityContext {
  const ctx = inject(communityKey)
  if (!ctx) throw new Error('community context not provided (must be used within the [slug] shell)')
  return ctx
}
```

Rework `[slug].vue` — name → `RouterLink to="/"`, add the admin ⚙ menu + badge, `provide` the context:

```vue
<script setup lang="ts">
import { onMounted, provide, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { getCommunity, setSelection } from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import CommunitySwitcher from '@/communities/CommunitySwitcher.vue'
import { useAuth } from '@/auth/useAuth'
import { communityKey } from '@/communities/context'

const route = useRoute('/[slug]')
const router = useRouter()
const community = ref<CommunityResponse | null>(null)
const state = ref<'loading' | 'ready' | 'no-access' | 'error'>('loading')
const adminMenuOpen = ref(false)
const { logout } = useAuth()

async function resolve(slug: string): Promise<void> {
  state.value = 'loading'
  try {
    community.value = await getCommunity(slug)
    state.value = 'ready'
    void setSelection(community.value.id)
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'error'
    community.value = null
  }
}
async function refresh(): Promise<void> {
  if (community.value) community.value = await getCommunity(community.value.slug)
}
// Non-null inside the 'ready' branch (RouterView only renders then). Children inject this.
provide(communityKey, { community: community as Readonly<typeof community>, refresh })

onMounted(() => resolve(String(route.params.slug)))
watch(() => route.params.slug, (s) => resolve(String(s)))

async function handleLogout(): Promise<void> {
  await logout()
  router.replace('/login')
}
</script>

<template>
  <div v-if="state === 'loading'" class="py-8 text-center text-sm text-neutral-500">Lade…</div>
  <div v-else-if="state === 'no-access'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">
      Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.
    </p>
  </div>
  <div v-else-if="state === 'error'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="text-sm text-neutral-600">Bitte später erneut versuchen.</p>
  </div>
  <div v-else>
    <header class="mb-4 flex items-center justify-between border-b px-4 py-2">
      <RouterLink to="/" class="font-semibold hover:underline">{{ community?.name }}</RouterLink>
      <div class="flex items-center gap-2">
        <div v-if="community?.viewerIsAdmin" data-test="admin-menu" class="relative">
          <button class="rounded border px-2 py-1 text-sm hover:bg-neutral-200" @click="adminMenuOpen = !adminMenuOpen">
            ⚙ Verwalten
            <span v-if="community.pendingCount > 0" class="ml-1 rounded-full bg-blue-600 px-1.5 text-xs text-white">{{ community.pendingCount }}</span>
          </button>
          <div v-if="adminMenuOpen" class="absolute right-0 z-10 mt-1 w-40 rounded border bg-white shadow" @click="adminMenuOpen = false">
            <RouterLink :to="`/${community.slug}/requests`" class="block px-3 py-1.5 text-sm hover:bg-neutral-100">
              Anfragen <span v-if="community.pendingCount > 0">({{ community.pendingCount }})</span>
            </RouterLink>
            <RouterLink :to="`/${community.slug}/members`" class="block px-3 py-1.5 text-sm hover:bg-neutral-100">Mitglieder</RouterLink>
            <RouterLink :to="`/${community.slug}/settings`" class="block px-3 py-1.5 text-sm hover:bg-neutral-100">Einstellungen</RouterLink>
          </div>
        </div>
        <CommunitySwitcher :current-slug="community!.slug" />
        <button data-test="logout" class="rounded border px-2 py-1 text-sm hover:bg-neutral-200" @click="handleLogout">Abmelden</button>
      </div>
    </header>
    <RouterView />
  </div>
</template>
```

- [ ] **Step 4: Run — expect PASS** (and the existing shell tests stay green).
- [ ] **Step 5: Commit** — `feat(web): admin ⚙ menu + community context + name home-link`

### Task 7: admin route guard + `/[slug]/requests.vue`

**Files:**
- Create: `webapp-vue/src/communities/useAdminGuard.ts`
- Create: `webapp-vue/src/pages/[slug]/requests.vue`
- Test: `webapp-vue/src/pages/[slug]/__tests__/requests.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { slug: 'team' } }), useRouter: () => ({ replace }) }))

// provide an admin context by mocking the inject helper
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { id: '1', name: 'Team', slug: 'team', startsAt: null, phaseTwoStartRound: null, viewerIsAdmin: true, pendingCount: 1 } },
    refresh: vi.fn(),
  }),
}))

describe('requests page', () => {
  beforeEach(() => replace.mockReset())
  it('lists pending members and approves one', async () => {
    const list = vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false },
    ])
    const approve = vi.spyOn(api, 'approveMember').mockResolvedValue(undefined as never)
    const Requests = (await import('@/pages/[slug]/requests.vue')).default
    const w = mount(Requests); await flushPromises()
    expect(w.text()).toContain('Alice')
    expect(w.text()).not.toContain('Bob') // only PENDING shown
    list.mockResolvedValue([{ userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false }])
    await w.find('[data-test=approve]').trigger('click'); await flushPromises()
    expect(approve).toHaveBeenCalledWith('team', 'u1')
  })
})
```
Add a second test: a non-admin context (`viewerIsAdmin: false`) calls `replace('/team/')` on mount (re-mock the context for that case).

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.** `communities/useAdminGuard.ts`:

```ts
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunityContext } from '@/communities/context'

/** Redirects to the community root if the viewer is not an admin. Backend `requireAdmin` is the real gate. */
export function useAdminGuard(): void {
  const router = useRouter()
  const { community } = useCommunityContext()
  onMounted(() => {
    if (!community.value.viewerIsAdmin) void router.replace(`/${community.value.slug}/`)
  })
}
```

`pages/[slug]/requests.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMembers, approveMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const all = ref<MemberResponse[]>([])
const error = ref<string | null>(null)
const pending = computed(() => all.value.filter((m) => m.status === 'PENDING'))

async function load(): Promise<void> {
  all.value = await listMembers(slug)
}
async function run(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await fn()
    await load()
    await refresh() // update the shell pending badge
  } catch {
    error.value = 'Aktion fehlgeschlagen.'
  }
}
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-lg py-8">
    <h1 class="mb-4 text-xl font-semibold">Beitrittsanfragen</h1>
    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="!pending.length" class="text-sm text-neutral-500">Keine offenen Anfragen.</p>
    <ul class="space-y-2">
      <li v-for="m in pending" :key="m.userId" class="flex items-center justify-between gap-2 border-b py-2 text-sm">
        <span>{{ m.username }}</span>
        <span class="flex gap-2">
          <button data-test="approve" class="rounded border px-2 py-0.5" @click="run(() => approveMember(slug, m.userId))">Bestätigen</button>
          <button class="rounded border px-2 py-0.5 text-red-600" @click="run(() => removeMember(slug, m.userId))">Ablehnen</button>
        </span>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): pending requests page + admin guard`

### Task 8: rework `members.vue` (active roster) + `settings.vue` (invite block)

**Files:**
- Modify: `webapp-vue/src/pages/[slug]/members.vue`
- Modify: `webapp-vue/src/pages/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/[slug]/__tests__/members.spec.ts` (adjust) + a settings test

- [ ] **Step 1: Write/adjust the failing tests.** Members now shows only ACTIVE (no PENDING rows) and uses the admin guard; mock the context as admin (as in Task 7). Assert promote/remove call the API; assert a PENDING member is NOT listed. Settings test: mock `getInvite` to return a link → the existing URL + a copy button render; `revokeInvite`/`generateInvite` wired.

```ts
// settings.spec.ts (sketch)
vi.mock('@/communities/context', () => ({ useCommunityContext: () => ({ community: { value: { slug: 'team', viewerIsAdmin: true, name: 'Team', startsAt: null, phaseTwoStartRound: null, id: '1', pendingCount: 0 } }, refresh: vi.fn() }) }))
it('shows the current invite link and can revoke it', async () => {
  vi.spyOn(api, 'getCommunity').mockResolvedValue({ id: '1', name: 'Team', slug: 'team', startsAt: null, phaseTwoStartRound: null, viewerIsAdmin: true, pendingCount: 0 })
  vi.spyOn(api, 'getInvite').mockResolvedValue({ url: '/join/tok', expiresAt: '2030-01-01T00:00:00Z' })
  const revoke = vi.spyOn(api, 'revokeInvite').mockResolvedValue(undefined as never)
  const Settings = (await import('@/pages/[slug]/settings.vue')).default
  const w = mount(Settings); await flushPromises()
  expect(w.text()).toContain('/join/tok')
  await w.find('[data-test=revoke-invite]').trigger('click'); await flushPromises()
  expect(revoke).toHaveBeenCalledWith('team')
})
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.** `members.vue` — add `useAdminGuard()`, source `slug` from the context, and filter to ACTIVE only:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMembers, promoteMember, demoteMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'

useAdminGuard()
const { community } = useCommunityContext()
const slug = community.value.slug
const all = ref<MemberResponse[]>([])
const error = ref<string | null>(null)
const active = computed(() => all.value.filter((m) => m.status === 'ACTIVE'))

async function load(): Promise<void> { all.value = await listMembers(slug) }
async function run(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try { await fn(); await load() } catch (e) {
    error.value = (e as { status?: number }).status === 409
      ? 'Die Community braucht mindestens einen Admin.'
      : 'Aktion fehlgeschlagen.'
  }
}
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-lg py-8">
    <h1 class="mb-4 text-xl font-semibold">Mitglieder</h1>
    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>
    <ul class="space-y-2">
      <li v-for="m in active" :key="m.userId" class="flex items-center justify-between gap-2 border-b py-2 text-sm">
        <span>{{ m.username }} <em v-if="m.isAdmin" class="text-neutral-500">(Admin)</em></span>
        <span class="flex gap-2">
          <button v-if="!m.isAdmin" class="rounded border px-2 py-0.5" @click="run(() => promoteMember(slug, m.userId))">Zu Admin</button>
          <button v-else class="rounded border px-2 py-0.5" @click="run(() => demoteMember(slug, m.userId))">Admin entz.</button>
          <button data-test="remove" class="rounded border px-2 py-0.5 text-red-600" @click="run(() => removeMember(slug, m.userId))">Entfernen</button>
        </span>
      </li>
    </ul>
  </section>
</template>
```

`settings.vue` — add `useAdminGuard()`, load current invite, copy/regenerate/revoke (VueUse `useClipboard`):

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import { getCommunity, updateCommunity, generateInvite, getInvite, revokeInvite } from '@/api/communities'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const name = ref('')
const startsAt = ref('')
const phaseTwoStartRound = ref<number | null>(null)
const inviteUrl = ref<string | null>(null)
const error = ref<string | null>(null)
const { copy, copied } = useClipboard()

function fullUrl(path: string): string { return `${window.location.origin}${path}` }

onMounted(async () => {
  const c = await getCommunity(slug)
  name.value = c.name
  startsAt.value = c.startsAt ?? ''
  phaseTwoStartRound.value = c.phaseTwoStartRound
  const inv = await getInvite(slug)
  inviteUrl.value = inv ? fullUrl(inv.url) : null
})

async function save(): Promise<void> {
  error.value = null
  try {
    const body: Partial<{ name: string; startsAt: string; phaseTwoStartRound: number }> = { name: name.value.trim() }
    if (startsAt.value) body.startsAt = startsAt.value
    if (phaseTwoStartRound.value !== null) body.phaseTwoStartRound = phaseTwoStartRound.value
    await updateCommunity(slug, body)
    await refresh()
  } catch { error.value = 'Speichern fehlgeschlagen.' }
}
async function regenerate(): Promise<void> {
  const r = await generateInvite(slug)
  inviteUrl.value = fullUrl(r.url)
}
async function revoke(): Promise<void> {
  await revokeInvite(slug)
  inviteUrl.value = null
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Einstellungen</h1>
    <form class="space-y-3" @submit.prevent="save">
      <label class="block text-sm">Name<input v-model="name" class="mt-1 w-full rounded border px-3 py-1.5" minlength="3" maxlength="50" /></label>
      <p class="text-xs text-neutral-500">URL-Slug <code>/{{ slug }}/</code> ist unveränderlich.</p>
      <label class="block text-sm">Start (ISO)<input v-model="startsAt" class="mt-1 w-full rounded border px-3 py-1.5" placeholder="2026-09-01T11:00:00+02:00" /></label>
      <label class="block text-sm">Phase-2-Startrunde<input v-model.number="phaseTwoStartRound" type="number" min="1" class="mt-1 w-full rounded border px-3 py-1.5" /></label>
      <button class="rounded border px-3 py-1.5 hover:bg-neutral-200">Speichern</button>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>

    <div class="mt-6 border-t pt-4">
      <h2 class="mb-2 font-medium">Einladungslink</h2>
      <div v-if="inviteUrl" class="space-y-2">
        <p class="break-all text-sm"><code>{{ inviteUrl }}</code></p>
        <div class="flex gap-2">
          <button class="rounded border px-2 py-1 text-sm hover:bg-neutral-200" @click="copy(inviteUrl)">{{ copied ? 'Kopiert!' : 'Kopieren' }}</button>
          <button class="rounded border px-2 py-1 text-sm hover:bg-neutral-200" @click="regenerate">Neu generieren</button>
          <button data-test="revoke-invite" class="rounded border px-2 py-1 text-sm text-red-600 hover:bg-neutral-200" @click="revoke">Widerrufen</button>
        </div>
      </div>
      <div v-else>
        <p class="mb-2 text-sm text-neutral-500">Kein aktiver Einladungslink.</p>
        <button data-test="generate-invite" class="rounded border px-3 py-1.5 hover:bg-neutral-200" @click="regenerate">Einladungslink erzeugen</button>
      </div>
    </div>
  </section>
</template>
```
(If `@vueuse/core` is not yet a dependency, `pnpm add @vueuse/core` — it's the project's sanctioned utility lib per the frontend guideline.)

- [ ] **Step 4: Run — expect PASS** (members + settings specs). Update any existing members spec that asserted PENDING rows.
- [ ] **Step 5: Commit** — `feat(web): active-only roster + invite management in settings`

### Task 9: full suites green + feed knowledge back

**Files:**
- Modify: `.claude/guidelines/frontend.md`

- [ ] **Step 1: Backend** — `cd core && ./mvnw clean test` → all green.
- [ ] **Step 2: Frontend** — `cd webapp-vue && pnpm test && pnpm lint && pnpm build` → all green (strict TS).
- [ ] **Step 3: Feed knowledge back** — append to `.claude/guidelines/frontend.md` a short note: the **per-community admin gating pattern** — the `/[slug]/` shell resolves `viewerIsAdmin` once and `provide`s a community context (`{ community, refresh }`); admin sub-routes call `useAdminGuard()` (inject + redirect non-admins) and read the context instead of re-fetching; the backend `requireAdmin` is the authoritative gate (client gating is UX only). Note the badge refresh via the provided `refresh()`.
- [ ] **Step 4: Commit** — `docs(community): admin gating pattern in frontend guideline`

---

## Self-Review

**Spec coverage:** viewerIsAdmin+pendingCount on detail (Task 2); GET /{slug}/invite (Task 3); members→admin-only (Task 4); pending count query (Task 1); ⚙ admin menu + badge + name→`/` link (Task 6); admin guard (Task 7); dedicated requests area approve/reject=remove (Task 7); active-only roster + promote/demote/remove + 409 message (Task 8); settings show-existing-link + copy + regenerate + revoke + meta edit (Task 8); context provide/inject (Task 6); feed-back (Task 9). Self-leave is explicitly out of scope (spec). All spec items map to a task.

**Type consistency:** `CommunityResponse` gains `viewerIsAdmin: boolean` + `pendingCount: number` on both sides (Kotlin DTO Task 2, TS type Task 5). `toResponse(viewerIsAdmin, pendingCount)` updated at all three call sites (create/get/update). `getInvite` returns `InviteResponse | null` (204→null). `useCommunityContext()` shape `{ community: Ref<CommunityResponse>, refresh }` is consumed identically in requests/members/settings + the guard. Routes `/[slug]/requests|members|settings` match the ⚙ menu links.

**Placeholder scan:** no TBD/TODO; code steps are complete; the `members` mapping in Task 4 step 3 is elided only because it's unchanged from the current file (the task modifies one line). Commands have expected outcomes.
