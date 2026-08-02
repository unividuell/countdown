# Community Route Namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move communities from `/:slug` to `/c/:slug` so no community name can ever shadow an app
route, and delete the reserved-slug blocklist that exists only to paper over that collision.

**Architecture:** Five sequential tasks, each independently green. Task 1 removes the backend
blocklist (self-contained). Task 2 is a pure refactor that funnels the eleven hand-built community
URLs through one `communityPath()` helper without changing a single path — every existing test must
stay green, which is what proves it behaviour-preserving. Task 3 then flips the namespace in that one
helper and moves the page files. Task 4 adds the 404 catch-all the move makes necessary. Task 5
updates the guidelines.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / kotest + Testcontainers (backend); Vue 3 · TypeScript
strict · Vue Router 5 file-based routing · Vitest + `@vue/test-utils` (frontend).

## Global Constraints

- **Branch:** work happens on `claude/countdown-issue-8-superpowers-f9d53d`, already rebased on
  `origin/develop` (`0a8721c`). The PR targets **`develop`**, never `main`.
- **TDD:** every task writes the failing test first, runs it to see it fail for the right reason,
  then implements. No exceptions.
- **No redundant inline comments.** Rationale belongs in the commit message and in
  `.claude/guidelines/`, not as a tombstone comment in the code. Do not leave a comment saying what
  used to be there.
- **Frontend tests use `vi`, never mockk.** Backend tests use mockk + kotest (`shouldBe`,
  `shouldThrow`), never Mockito or `kotlin.test`.
- **`src/lib/slugify.ts` must stay a byte-for-byte behavioural mirror of `Slugs.slugify`.** This plan
  changes neither — do not touch either one.
- **Docker must be running** for the backend suite (Testcontainers). `CommunityServiceTest` and
  `CommunityRepositoryTest` are `@SpringBootTest` with `TestcontainersConfiguration`.
- **Commit after every task**, with a message explaining *why*, and ending with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `webapp-vue/src/communities/routes.ts` | The single place that knows where community URLs live. Pure string functions, no router dependency. |
| `webapp-vue/src/communities/__tests__/routes.spec.ts` | Unit tests for the above. |
| `webapp-vue/src/pages/[...path].vue` | Catch-all 404 page. |
| `webapp-vue/src/pages/__tests__/not-found.spec.ts` | Tests for the 404 page. |

**Moved** (`git mv`, content changes are separate and listed per task)

```
webapp-vue/src/pages/[slug].vue                        → webapp-vue/src/pages/c/[slug].vue
webapp-vue/src/pages/[slug]/index.vue                  → webapp-vue/src/pages/c/[slug]/index.vue
webapp-vue/src/pages/[slug]/members.vue                → webapp-vue/src/pages/c/[slug]/members.vue
webapp-vue/src/pages/[slug]/requests.vue               → webapp-vue/src/pages/c/[slug]/requests.vue
webapp-vue/src/pages/[slug]/settings.vue               → webapp-vue/src/pages/c/[slug]/settings.vue
webapp-vue/src/pages/[slug]/__tests__/members.spec.ts  → webapp-vue/src/pages/c/[slug]/__tests__/members.spec.ts
webapp-vue/src/pages/[slug]/__tests__/requests.spec.ts → webapp-vue/src/pages/c/[slug]/__tests__/requests.spec.ts
webapp-vue/src/pages/[slug]/__tests__/settings.spec.ts → webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts
webapp-vue/src/pages/__tests__/slug-shell.spec.ts      → webapp-vue/src/pages/c/__tests__/slug-shell.spec.ts
```

**Modified**

| File | Change |
|---|---|
| `core/.../community/internal/Slugs.kt` | Delete `RESERVED` and `isReserved`; keep `slugify`. |
| `core/.../community/internal/CommunityService.kt` | Delete the `isReserved` guard (line 24). |
| `core/.../community/SlugsTest.kt` | Delete the reserved test. |
| `core/.../community/CommunityServiceTest.kt` | Reserved-rejection test becomes an acceptance test. |
| `core/.../community/CommunityControllerTest.kt` | Retarget the 409 fixture away from a reserved name. |
| `webapp-vue/src/communities/CommunityMenu.vue` | 4 URL sites → `communityPath`. |
| `webapp-vue/src/communities/useAdminGuard.ts` | 1 URL site. |
| `webapp-vue/src/communities/landingGuard.ts` | 1 URL site. |
| `webapp-vue/src/pages/join/[token].vue` | 1 URL site. |
| `webapp-vue/src/pages/communities/index.vue` | 1 URL site. |
| `webapp-vue/src/pages/communities/new.vue` | 1 URL site + the 409 error copy. |
| `webapp-vue/src/pages/super-admin/communities.vue` | 2 URL sites + 1 display string. |
| `webapp-vue/src/communities/__tests__/routeData.spec.ts` | Memory-router record `/:slug` → `/c/:slug`. |
| `webapp-vue/src/communities/__tests__/landingGuard.spec.ts` | Same. |
| `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts` | Push assertion → `/c/nord/`. |
| `webapp-vue/src/pages/__tests__/index.spec.ts` | Two replace assertions → `/c/team/`. |
| `webapp-vue/src/pages/join/__tests__/token.spec.ts` | One replace assertion → `/c/team/`. |
| `webapp-vue/src/pages/super-admin/__tests__/communities.spec.ts` | href assertion → `/c/team/settings`. |
| `webapp-vue/typed-router.d.ts` | Regenerated (committed artefact). |
| `.claude/guidelines/multi-tenancy.md` | Rewrite the routing section. |
| `.claude/guidelines/frontend.md` | Delete the `Slugs.RESERVED` obligation. |

**Deliberately NOT modified**

- `webapp-vue/src/communities/routeData.ts` — its `slugOf()` reads `route.params.slug` positionally
  agnostic, so the guard works unchanged under the new prefix. Resist the urge to "update" it.
- `deploy/Caddyfile` — `@backend path /api/* /oauth2/* /login/* /logout /logout/*` is mutually
  exclusive with `/c/*`, and the SPA catch-all already serves `index.html` for everything else.
- `webapp-vue/src/lib/slugify.ts` and `core/.../Slugs.slugify` — the algorithm does not change.
- No Flyway migration. The slug column is untouched; only its URL position changes.

---

### Task 1: Remove the reserved-slug blocklist (backend)

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/Slugs.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityService.kt:24`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/SlugsTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityServiceTest.kt:49-52`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt:43-50`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Slugs` keeps exactly one public member — `fun slugify(name: String): String`.
  `SlugUnavailableException` survives unchanged and now means only "this slug is already taken".

- [ ] **Step 1: Turn the reserved-rejection test into an acceptance test**

In `CommunityServiceTest.kt`, replace the whole `create rejects a reserved slug` test (lines 49-52)
with the behaviour the issue asks for. "Super Admin" is the case the issue names explicitly, and it
slugifies to `super-admin`, so it is the honest regression guard:

```kotlin
    @Test
    fun `create accepts a name whose slug used to be reserved`() {
        val c = service.create(aUser().id!!, "Super Admin")
        c.slug shouldBe "super-admin"
    }
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

```bash
cd core && ./mvnw test -Dtest=CommunityServiceTest
```

Expected: FAIL — `SlugUnavailableException: slug 'super-admin' is reserved`. If it fails with
anything else (a Docker/Testcontainers error, a connection refused), stop and fix the environment
first; a red test for the wrong reason proves nothing.

- [ ] **Step 3: Delete the blocklist**

`Slugs.kt` becomes exactly this — note the comment above `RESERVED` goes too, and no replacement
comment is added:

```kotlin
package org.unividuell.countdown.core.community.internal

import java.text.Normalizer

object Slugs {
    fun slugify(name: String): String {
        val umlauts = name.lowercase()
            .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        val noDiacritics = Normalizer.normalize(umlauts, Normalizer.Form.NFKD)
            .replace("\\p{M}+".toRegex(), "")
        return noDiacritics
            .replace("[^a-z0-9]+".toRegex(), "-")
            .trim('-')
            .replace("-+".toRegex(), "-")
    }
}
```

In `CommunityService.kt`, delete this single line (currently line 24):

```kotlin
        if (Slugs.isReserved(slug)) throw SlugUnavailableException("slug '$slug' is reserved")
```

The two lines around it — the `require(slug.length >= 3)` above and the `findBySlug` duplicate check
below — stay exactly as they are.

- [ ] **Step 4: Delete the now-meaningless unit test**

In `SlugsTest.kt`, delete the entire `reserved slugs are detected` test (it references
`Slugs.isReserved`, which no longer exists, so the file will not compile until you do). The
`derives url-safe slug with german transliteration` test stays untouched.

- [ ] **Step 5: Retarget the controller's 409 fixture**

`CommunityControllerTest.kt` mocks the service, so its 409 test still passes — but it currently uses
`"join"` and the message `"reserved"`, which would document a rule that no longer exists. Replace the
whole test with the surviving cause (a taken slug); the assertion is unchanged:

```kotlin
    @Test
    fun `POST surfaces slug conflict as 409`() {
        every { communityService.create(uid, "Team A") } throws SlugUnavailableException("slug 'team-a' is taken")
        mockMvc.post("/api/communities") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isConflict() } }
    }
```

- [ ] **Step 6: Run the full community suite**

```bash
cd core && ./mvnw test -Dtest='Community*Test,SlugsTest'
```

Expected: PASS, all green.

- [ ] **Step 7: Run the whole backend suite**

```bash
cd core && ./mvnw test
```

Expected: PASS. This catches anything else that referenced `isReserved`.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/Slugs.kt \
        core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityService.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/SlugsTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityServiceTest.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt
git commit -m "$(cat <<'EOF'
feat(community): drop the reserved-slug blocklist

The list existed so a community could not shadow a frontend route, which
made every new page a constraint on what users may call their community
-- and silently rejected harmless names: "Super Admin" slugifies to
super-admin and was refused. Confining communities to /c/ (next commit)
removes the collision at its source, so the list has nothing left to
guard. SlugUnavailableException stays; it now means only "taken".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Funnel every community URL through one helper (no behaviour change)

This task must not change a single URL. Every existing frontend test stays green — that is the proof
that the refactor is behaviour-preserving, and it is what makes Task 3 a one-line change.

**Files:**
- Create: `webapp-vue/src/communities/routes.ts`
- Create: `webapp-vue/src/communities/__tests__/routes.spec.ts`
- Modify: `webapp-vue/src/communities/CommunityMenu.vue:32,52,60,61`
- Modify: `webapp-vue/src/communities/useAdminGuard.ts:10`
- Modify: `webapp-vue/src/communities/landingGuard.ts:22`
- Modify: `webapp-vue/src/pages/join/[token].vue:15`
- Modify: `webapp-vue/src/pages/communities/index.vue:16`
- Modify: `webapp-vue/src/pages/communities/new.vue:18,22`
- Modify: `webapp-vue/src/pages/super-admin/communities.vue:41,43,46`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```ts
  export type CommunitySubPage = 'members' | 'requests' | 'settings'
  export function communityPath(slug: string, sub?: CommunitySubPage): string
  ```
  Task 3 changes only this function's body.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/communities/__tests__/routes.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { communityPath } from '@/communities/routes'

describe('communityPath', () => {
  it('builds the community root with a trailing slash', () => {
    expect(communityPath('team')).toBe('/team/')
  })

  it('builds each sub-page without a trailing slash', () => {
    expect(communityPath('team', 'members')).toBe('/team/members')
    expect(communityPath('team', 'requests')).toBe('/team/requests')
    expect(communityPath('team', 'settings')).toBe('/team/settings')
  })
})
```

The trailing-slash asymmetry is not an oversight — it is what the app does today
(`` `/${slug}/` `` for the root, `` `/${slug}/members` `` for children), and this task must preserve
it exactly.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd webapp-vue && pnpm test src/communities/__tests__/routes.spec.ts
```

Expected: FAIL — cannot resolve `@/communities/routes`.

- [ ] **Step 3: Write the helper**

Create `webapp-vue/src/communities/routes.ts`:

```ts
/**
 * The only place that knows where community URLs live. Every link, redirect and guard goes
 * through here so the scheme is one edit, not a search across the app.
 */
export type CommunitySubPage = 'members' | 'requests' | 'settings'

export function communityPath(slug: string, sub?: CommunitySubPage): string {
  return sub ? `/${slug}/${sub}` : `/${slug}/`
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd webapp-vue && pnpm test src/communities/__tests__/routes.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Adopt it in `CommunityMenu.vue`**

Add to the imports in `<script setup>`:

```ts
import { communityPath } from '@/communities/routes'
```

Change `go()` (line 32):

```ts
function go(c: CommunitySummary): void {
  router.push(communityPath(c.slug)).catch((e) => console.error('navigation failed', e))
}
```

And the three `RouterLink`s in the template (lines 52, 60, 61):

```html
      <RouterLink :to="communityPath(community.slug, 'requests')" :class="ENTRY">
```
```html
      <RouterLink :to="communityPath(community.slug, 'members')" :class="ENTRY">Mitglieder</RouterLink>
      <RouterLink :to="communityPath(community.slug, 'settings')" :class="ENTRY">Einstellungen</RouterLink>
```

(A function imported in `<script setup>` is available in the template — no `return` needed.)

- [ ] **Step 6: Adopt it in `useAdminGuard.ts`**

```ts
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunityContext } from '@/communities/context'
import { communityPath } from '@/communities/routes'

/** Redirects to the community root if the viewer is not an admin. Backend `requireAdmin` is the real gate. */
export function useAdminGuard(): void {
  const router = useRouter()
  const { community } = useCommunityContext()
  onMounted(() => {
    if (!community.value.viewerIsAdmin) void router.replace(communityPath(community.value.slug))
  })
}
```

- [ ] **Step 7: Adopt it in `landingGuard.ts`**

Add `import { communityPath } from '@/communities/routes'` and change line 22:

```ts
    return l.kind === 'none' || l.kind === 'choose' ? '/communities' : communityPath(l.slug)
```

- [ ] **Step 8: Adopt it in `pages/join/[token].vue`**

Add the import and change line 15:

```ts
    if (r.status === 'ALREADY_ACTIVE') return router.replace(communityPath(r.slug))
```

- [ ] **Step 9: Adopt it in `pages/communities/index.vue`**

Add `import { communityPath } from '@/communities/routes'` to `<script setup>` and change the link:

```html
        <RouterLink :to="communityPath(c.slug)" class="text-blue-700 hover:underline">{{
          c.name
        }}</RouterLink>
```

- [ ] **Step 10: Adopt it in `pages/communities/new.vue`, and fix the error copy**

Add the import; change line 18 to `router.replace(communityPath(c.slug))`. Then fix the 409 message
(line 22), which currently promises a rule that Task 1 deleted:

```ts
        ? 'Dieser Name ergibt einen bereits vergebenen Slug — bitte Namen anpassen.'
```

- [ ] **Step 11: Adopt it in `pages/super-admin/communities.vue`**

Add the import. The two links (lines 43, 46):

```html
          <RouterLink :to="communityPath(c.slug)" class="text-sm text-blue-700 hover:underline">
            Öffnen
          </RouterLink>
          <RouterLink :to="communityPath(c.slug, 'settings')" class="text-sm text-blue-700 hover:underline">
            Einstellungen
          </RouterLink>
```

And the displayed path (line 41), which hard-codes the scheme as *text* and would otherwise lie to
the super-admin after Task 3:

```html
          <code class="text-xs text-neutral-500">{{ communityPath(c.slug) }}</code>
```

- [ ] **Step 12: Verify nothing is left**

```bash
cd webapp-vue && grep -rn '`/\${' src --include="*.vue" --include="*.ts" | grep -v '/api/'
```

Expected: **no output.** Every remaining `` `/${…}` `` would be an unconverted site. (The `/api/`
exclusion is deliberate — `src/api/*.ts` builds backend URLs, which are a different namespace and
must not go through `communityPath`.)

- [ ] **Step 13: Run the full frontend suite, typecheck and lint**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Expected: **all green, with no test file edited in this task.** If a test needed changing, the
refactor changed behaviour — find out why before continuing.

- [ ] **Step 14: Commit**

```bash
git add webapp-vue/src
git commit -m "$(cat <<'EOF'
refactor(web): build community URLs in one place

Eleven call sites interpolated `/${slug}/` by hand, which is what made
the route scheme feel expensive to change. communityPath() returns the
identical strings -- the whole suite stays green untouched -- so moving
communities under a prefix becomes one edit instead of a search.

The super-admin's displayed path now renders through the same helper
rather than hard-coding the scheme as text, so it cannot drift from
where the link actually goes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move communities to `/c/:slug`

**Files:**
- Modify: `webapp-vue/src/communities/routes.ts`
- Modify: `webapp-vue/src/communities/__tests__/routes.spec.ts`
- Move: the nine files listed under **File Structure → Moved**
- Modify: `webapp-vue/src/pages/c/__tests__/slug-shell.spec.ts` (import path)
- Modify: `webapp-vue/src/pages/c/[slug]/__tests__/{members,requests,settings}.spec.ts` (import paths)
- Modify: `webapp-vue/src/communities/__tests__/routeData.spec.ts:44`
- Modify: `webapp-vue/src/communities/__tests__/landingGuard.spec.ts:41`
- Modify: `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts:109`
- Modify: `webapp-vue/src/pages/__tests__/index.spec.ts:45,72`
- Modify: `webapp-vue/src/pages/join/__tests__/token.spec.ts:34`
- Modify: `webapp-vue/src/pages/super-admin/__tests__/communities.spec.ts:55`
- Modify: `webapp-vue/typed-router.d.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `communityPath(slug, sub?)` from Task 2.
- Produces: routes `/c/:slug`, `/c/:slug/members`, `/c/:slug/requests`, `/c/:slug/settings`.
  Task 4 relies on `/c/*` being the only place a `slug` param occurs.

- [ ] **Step 1: Update the helper's test to the new scheme**

In `routes.spec.ts`, change every expectation to carry the prefix:

```ts
  it('builds the community root with a trailing slash', () => {
    expect(communityPath('team')).toBe('/c/team/')
  })

  it('builds each sub-page without a trailing slash', () => {
    expect(communityPath('team', 'members')).toBe('/c/team/members')
    expect(communityPath('team', 'requests')).toBe('/c/team/requests')
    expect(communityPath('team', 'settings')).toBe('/c/team/settings')
  })
```

Add a third test that states the invariant, so an accidental revert to root-level paths fails loudly
rather than quietly re-opening the collision:

```ts
  it('keeps communities out of the root namespace', () => {
    // The whole point of the prefix: a slug that matches an app route stays reachable.
    expect(communityPath('super-admin')).toBe('/c/super-admin/')
    expect(communityPath('communities')).toBe('/c/communities/')
  })
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd webapp-vue && pnpm test src/communities/__tests__/routes.spec.ts
```

Expected: FAIL — three assertions reporting `/team/` where `/c/team/` was expected.

- [ ] **Step 3: Flip the helper**

In `routes.ts`, the body becomes:

```ts
export function communityPath(slug: string, sub?: CommunitySubPage): string {
  return sub ? `/c/${slug}/${sub}` : `/c/${slug}/`
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd webapp-vue && pnpm test src/communities/__tests__/routes.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Move the page files**

Use `git mv` so history follows the files:

```bash
cd webapp-vue/src/pages
mkdir -p c
git mv '[slug].vue' 'c/[slug].vue'
git mv '[slug]' 'c/[slug]'
mkdir -p c/__tests__
git mv '__tests__/slug-shell.spec.ts' 'c/__tests__/slug-shell.spec.ts'
```

- [ ] **Step 6: Fix the dynamic import paths in the moved specs**

Four files reference the old locations in `await import(...)`:

- `src/pages/c/__tests__/slug-shell.spec.ts:38` → `await import('@/pages/c/[slug].vue')`
- `src/pages/c/[slug]/__tests__/members.spec.ts` → `@/pages/c/[slug]/members.vue` and
  `@/pages/c/[slug]/settings.vue` (this file imports both)
- `src/pages/c/[slug]/__tests__/requests.spec.ts` → `@/pages/c/[slug]/requests.vue`
- `src/pages/c/[slug]/__tests__/settings.spec.ts` → `@/pages/c/[slug]/settings.vue`

Find them all rather than trusting this list:

```bash
cd webapp-vue && grep -rn "@/pages/\[slug\]" src
```

Expected after fixing: no output.

No source file needs a typed-route change — after the navigation-flicker refactor no page calls
`useRoute('/[slug]')` any more; children read `useCommunityContext()` instead. Verify:

```bash
cd webapp-vue && grep -rn "useRoute('/" src
```

Expected: only `src/pages/join/[token].vue` (`useRoute('/join/[token]')`), which does not move.

- [ ] **Step 7: Move the memory-router records in the guard specs**

Both guard specs build a router that mirrors the file-based layout, so both must mirror the new one.

`src/communities/__tests__/routeData.spec.ts:44` — the comment above it says "Mirrors the file-based
layout"; update the comment's path too if it names `/[slug]`:

```ts
        path: '/c/:slug',
```

`src/communities/__tests__/landingGuard.spec.ts:41`:

```ts
      { path: '/c/:slug', component: Stub, children: [{ path: '', component: Stub }] },
```

- [ ] **Step 8: Update the four path assertions**

`src/communities/__tests__/CommunityMenu.spec.ts:109`:

```ts
    expect(pushMock).toHaveBeenCalledWith('/c/nord/')
```

`src/pages/__tests__/index.spec.ts` — **both** occurrences (lines 45 and 72):

```ts
    expect(replace).toHaveBeenCalledWith('/c/team/')
```

`src/pages/join/__tests__/token.spec.ts:34`:

```ts
    expect(replace).toHaveBeenCalledWith('/c/team/')
```

`src/pages/super-admin/__tests__/communities.spec.ts:55`:

```ts
    expect(w.find('a[href="/c/team/settings"]').exists()).toBe(true)
```

- [ ] **Step 9: Regenerate `typed-router.d.ts`**

The file is a committed build artefact produced by the VueRouter Vite plugin — `vue-tsc` does not
generate it, so `pnpm build` would typecheck against the stale copy first. Run the Vite build alone:

```bash
cd webapp-vue && pnpm exec vite build
```

Then confirm the regeneration landed:

```bash
cd webapp-vue && grep -c "'/c/\[slug\]" typed-router.d.ts
```

Expected: a non-zero count, and no remaining `'/[slug]'` entries:

```bash
cd webapp-vue && grep -n "'/\[slug\]'" typed-router.d.ts
```

Expected: no output.

- [ ] **Step 10: Run the full suite, typecheck and lint**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add -A webapp-vue
git commit -m "$(cat <<'EOF'
feat(web): move communities under a /c/ prefix

Closes #8. Communities sat at /:slug, so every static route shared a
namespace with every conceivable community name and Vue Router's
static-first matching made a colliding community unreachable. With slugs
confined below /c/ that is not merely avoided but impossible, and adding
a page no longer constrains what users may name their community.

routeData.ts is untouched on purpose: its slugOf() reads
route.params.slug wherever the segment sits, so the guard follows the
move without knowing about it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add the 404 catch-all

The move leaves `/hhh` and every typo matching nothing, and the app has no catch-all at all — it
would render a blank page. This task closes the gap the move opens.

**Files:**
- Create: `webapp-vue/src/pages/[...path].vue`
- Create: `webapp-vue/src/pages/__tests__/not-found.spec.ts`

**Interfaces:**
- Consumes: nothing. The page is standalone and imports no app state.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/pages/__tests__/not-found.spec.ts`.

The second test needs a word of explanation, because the obvious way to write it does not work.
`definePage` is a **build-time macro** stripped by the VueRouter Vite plugin, and the unit tests run
without that plugin (`src/test-setup.ts` stubs it as a no-op) — so the declared `meta` is simply not
readable from the mounted component. Asserting on the source file is the honest way to guard it, and
it does catch the real regression: someone dropping `meta.public` and thereby routing every typo
through a GitHub login round-trip.

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotFound from '@/pages/[...path].vue'

const RouterLinkStub = { template: '<a :href="to"><slot/></a>', props: ['to'] }

describe('the 404 page', () => {
  it('says the address does not exist and offers a way back', () => {
    const w = mount(NotFound, { global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain('Seite nicht gefunden')
    expect(w.find('a').attributes('href')).toBe('/')
  })

  it('is public, so a mistyped URL never routes through the login round-trip', async () => {
    const src = await readFile(new URL('../[...path].vue', import.meta.url), 'utf8')
    expect(src).toContain('definePage({ meta: { public: true } })')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd webapp-vue && pnpm test src/pages/__tests__/not-found.spec.ts
```

Expected: FAIL — cannot resolve `@/pages/[...path].vue`.

- [ ] **Step 3: Write the page**

Create `webapp-vue/src/pages/[...path].vue`. The markup mirrors the existing "Kein Zugriff" and
"Etwas ist schiefgelaufen" branches in `src/pages/c/[slug].vue`, so the app has one visual language
for dead ends:

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'

definePage({ meta: { public: true } })
</script>

<template>
  <section class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Seite nicht gefunden</h1>
    <p class="mb-4 text-sm text-neutral-600">Diese Adresse gibt es nicht.</p>
    <RouterLink to="/" class="text-sm text-blue-700 hover:underline">Zur Übersicht</RouterLink>
  </section>
</template>
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd webapp-vue && pnpm test src/pages/__tests__/not-found.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Confirm the catch-all does not swallow real routes**

The catch-all is the lowest-priority match, but that is worth proving rather than assuming — a
misplaced catch-all silently eats every page:

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Expected: all green — in particular the existing `login`, `index`, `super-admin-shell` and
`slug-shell` specs, which would break if the catch-all outranked them.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/pages
git commit -m "$(cat <<'EOF'
feat(web): answer unmatched paths with a 404 page

Moving communities to /c/ leaves /hhh and every typo matching nothing,
and the app had no catch-all -- an unknown address rendered a blank
page. The route is meta.public on purpose: the auth guard stashes the
destination for the post-login redirect, so a protected catch-all would
walk an anonymous visitor through GitHub login only to show the 404
anyway. A wrong address is not a reason to authenticate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update the guidelines

**Files:**
- Modify: `.claude/guidelines/multi-tenancy.md:64-82,96`
- Modify: `.claude/guidelines/frontend.md:212-216`

**Interfaces:**
- Consumes: the finished state of Tasks 1-4.
- Produces: nothing.

- [ ] **Step 1: Delete the reserved-slug paragraph in `multi-tenancy.md`**

Remove lines 64-65 entirely:

```
Reserved slugs (`api`, `oauth2`, `login`, `logout`, `communities`, `join`) are rejected at
creation; the full blocklist lives in `Slugs.RESERVED`.
```

- [ ] **Step 2: Rewrite the "URL-slug-as-context routing" section**

Replace the whole section (currently lines 70-82, from the `### URL-slug-as-context routing` heading
down to and including the "Typed route params" paragraph) with the text below.

Two things are being corrected at once. The routing rule is new. But the numbered list is *also
already stale* — it still describes the shell fetching `getCommunity(slug)` on mount, which the
navigation-flicker refactor moved into a router guard. `frontend.md` was updated then and this file
was not; leaving it half-corrected would be worse than either state.

````markdown
### Community URLs live under `/c/`

```
Backend (Caddy → core)   /api/*   /oauth2/*   /login/*   /logout
App pages (root)         /   /login   /communities   /communities/new
                         /super-admin   /super-admin/communities   /join/:token
Communities              /c/:slug/   /c/:slug/members   /c/:slug/requests   /c/:slug/settings
Anything else            the catch-all 404 (`src/pages/[...path].vue`)
```

**Rule:** communities are confined below `/c/`; the root namespace belongs to app pages. A slug
therefore cannot shadow a route, whatever it is called — not "nothing collides today" but
structurally impossible. Two consequences bind future work:

- **Adding a page requires no thought about slugs.** There is no blocklist to extend, and
  reintroducing one is not allowed: a product decision about pages must never become a constraint on
  what users may name their community. (This is what #8 removed; `Slugs.RESERVED` is gone.)
- **Build community URLs with `communityPath(slug, sub?)`** from `src/communities/routes.ts`, never
  by interpolating a path. It is the only place that knows the scheme.

The tenant context is resolved by a **router guard**, not by the shell page:

1. `registerCommunityDataGuard` (`src/communities/routeData.ts`) reads `route.params.slug` in
   `beforeResolve`, fetches the community before the route commits, and publishes it in `afterEach`.
   It matches on the *param*, not on a path, which is why the `/c/` move did not touch it.
   - Success → member; the guard records the selection and the shell renders its children.
   - 404 → "Kein Zugriff" (no info leak, matching the backend).
2. `src/pages/c/[slug].vue` is a thin renderer over that state and does no fetching of its own.
3. Nested routes (`/c/:slug/`, `/c/:slug/members`, …) render through `<RouterView />` inside it.

**Typed route params:** use the typed `useRoute('/c/[slug]')` overload (the route name from the
generated `typed-router.d.ts`) rather than plain `useRoute()`, which returns a union of all routes
and fails on `.params.slug` under `strict` + vue-tsc. In practice no community page needs it — they
read `useCommunityContext()` instead.
````

- [ ] **Step 3: Fix the landing target in `multi-tenancy.md`**

In the "Post-login redirect flow" section, line 96 currently reads `` - `one` / `last` → `/<slug>/`. ``
Change it to:

```markdown
- `one` / `last` → `/c/<slug>/` (via `communityPath`).
```

- [ ] **Step 4: Delete the `Slugs.RESERVED` obligation in `frontend.md`**

The bullet at lines 212-214 tells page authors to reserve their segment — exactly the duty this
change abolishes. Replace those three lines:

```markdown
- `src/pages/super-admin.vue` is a **layout** for `src/pages/super-admin/*.vue`. A static route
  segment outranks the dynamic `/:slug`, so no router config is needed — but reserve the segment
  in the backend's `Slugs.RESERVED`, or a community with that slug becomes unreachable.
```

with:

```markdown
- `src/pages/super-admin.vue` is a **layout** for `src/pages/super-admin/*.vue`. No router config is
  needed, and no slug needs reserving: communities live under `/c/`, so the root namespace is free
  for pages (see [multi-tenancy.md](multi-tenancy.md)).
```

- [ ] **Step 5: Check no stale reference survives**

```bash
grep -rn "RESERVED\|reserved slug\|/:slug\b" .claude/guidelines/ docs/superpowers/specs/2026-08-02-community-route-namespace-design.md
```

Review each hit. Hits inside the design doc's "Purpose" section are historical context and stay;
any hit in `.claude/guidelines/` that still presents the blocklist or the root-level slug as current
must be fixed.

- [ ] **Step 6: Commit**

```bash
git add .claude/guidelines
git commit -m "$(cat <<'EOF'
docs(guidelines): record the /c/ route namespace rule

multi-tenancy.md documented the very invariant #8 removed -- that static
routes outrank the dynamic :slug -- and told page authors to extend
Slugs.RESERVED. Both are gone.

Its numbered list was separately stale: it still had the shell fetching
on mount, which the navigation-flicker change moved into a router guard.
frontend.md was updated then and this file was missed, so it is brought
along here rather than left half-corrected.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Full backend suite:** `cd core && ./mvnw test` — PASS.
- [ ] **Full frontend suite:** `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint` — PASS.
- [ ] **Manual smoke test** via the preview tools, not by asking the user: start the dev server,
      sign in, and confirm `/c/<slug>/` renders the community, the header menu switches between
      communities, `/c/<slug>/settings` loads, and `/hhh` shows the 404 rather than a blank page.
- [ ] **The blocklist is really gone:** `grep -rn "RESERVED\|isReserved" core/src webapp-vue/src`
      returns nothing.
- [ ] **No hand-built community URL survives:**
      ``cd webapp-vue && grep -rn '`/\${' src --include="*.vue" --include="*.ts" | grep -v '/api/'``
      returns nothing.
- [ ] **PR targets `develop`:** `gh pr create --base develop`, referencing "Closes #8".
