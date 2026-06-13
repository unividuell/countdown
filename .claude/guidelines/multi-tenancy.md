# Multi-Tenancy (Community Module)

The app is multi-tenant: a **`community`** (Spielgemeinschaft) is the first-class tenant.
Every feature that scopes data to a tenant must carry a `community_id`.

## Backend conventions

### Module structure

The `community` module follows the same `public / internal` pattern as `iam`.

**Public API** (base package `…community`):
- `Community` — the aggregate (read-only; immutable from callers).
- `CommunityQuery` — `findBySlug(slug)`, `findById(id)`.
- `MembershipQuery` — `isActiveMember`, `isAdmin`, `activeCommunitiesOf`.

**Internal-only** (`…community.internal`):
- Repositories, services, controllers, DTOs, exception handler.
- `CommunityAccess` — resolves `(userId, isSuperAdmin, slug)` → `Community` or throws.

### `CommunityAccess` — authorization resolver pattern

```kotlin
// requireActiveMember → Community (or CommunityAccessDeniedException → 404)
// requireAdmin        → Community (or NotAdminException → 403, or CommunityAccessDeniedException → 404)
access.requireActiveMember(me.uid, me.sa, slug)
access.requireAdmin(me.uid, me.sa, slug)
```

Super-admin (`isSuperAdmin = true`) bypasses both membership and admin checks.
The 404 / no-info-leak semantic is intentional: non-members get the same response as
"community does not exist".

### Cross-module read pattern

Other modules that need community context (to scope rows) call `CommunityQuery`/`MembershipQuery`
from the `community` module's public API — **never reach into `.internal`**.
Migration ordering follows the dependency tree automatically (see `modules-and-migrations.md`).

### `community_id` scoping rule

New tables that hold per-community data carry a non-null FK:
```sql
community_id UUID NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE
```
Services gate all reads/writes behind `CommunityAccess` before touching the repository;
they never expose rows from a different tenant.

## Slug derivation — parity rule

The slug is **derived once at creation** from the community name and never changed.
Kotlin (`Slugs.slugify`) is the **source of truth** for the algorithm;
the TypeScript mirror (`src/lib/slugify.ts`) must stay identical.

**Rule:** whenever `Slugs.slugify` changes, update `slugify.ts` in the same commit,
and keep `slugify.spec.ts` running the same test cases as `SlugsTest.kt`.

Algorithm (current):
1. Lowercase + German umlaut transliteration (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`).
2. NFKD normalisation + strip combining marks (remaining diacritics).
3. Replace `[^a-z0-9]+` with `-`, trim leading/trailing `-`, collapse multiple `-`.

Reserved slugs (`api`, `oauth2`, `login`, `logout`, `communities`, `join`) are rejected at
creation; the full blocklist lives in `Slugs.RESERVED`.

## Frontend conventions

### URL-slug-as-context routing

The shell page `src/pages/[slug].vue` is the **tenant context guard**:
1. On mount / on slug change: calls `getCommunity(slug)`.
   - Success → member, record selection via `setSelection(community.id)`, render children.
   - 404 → show "Kein Zugriff" (no info leak to match backend).
2. Nested routes (`/[slug]/`, `/[slug]/members`, `/[slug]/settings`) are rendered via
   `<RouterView />` inside the shell.
3. Static routes (`/communities`, `/communities/new`, `/join/:token`) take priority over the
   dynamic `:slug` segment — Vue Router 5 matches them first.

**Typed route params:** use `useRoute('/[slug]')`, `useRoute('/[slug]/members')` etc.
(the typed overload from the generated `typed-router.d.ts`) rather than plain `useRoute()`.
This avoids a union-type error under `strict` + vue-tsc.

### Last-selected community

After successfully resolving a community in the shell, `setSelection(community.id)` is called
(fire-and-forget `void`). The `useCommunities().landing()` composable uses the server-side
selection to pick the last-visited community when the user has multiple active memberships.

### Post-login redirect flow (`/` resolver)

`src/pages/index.vue` is a redirect resolver, not a landing page. It calls
`useCommunities().landing()` and routes:
- `none` / `choose` → `/communities` (chooser).
- `one` / `last` → `/<slug>/`.

### Logout reachability

Since `index.vue` is now a redirect resolver (no UI), logout must appear in two places:
1. **Community shell header** (`/[slug].vue`) — next to the `CommunitySwitcher`.
2. **`/communities` page** — for users with no active community.

Both call `useAuth().logout()` then `router.replace('/login')`.

### `exactOptionalPropertyTypes` + optional body fields

With `exactOptionalPropertyTypes: true`, never pass `prop: x || undefined`.
Build the patch body with explicit conditional assignment:

```ts
const body: Partial<{ name: string; startsAt: string; phaseTwoStartRound: number }> = {
  name: name.value.trim(),
}
if (startsAt.value) body.startsAt = startsAt.value
if (phaseTwoStartRound.value !== null) body.phaseTwoStartRound = phaseTwoStartRound.value
await updateCommunity(slug, body)
```
