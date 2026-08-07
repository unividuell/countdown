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
The general rules for such Kotlin↔TS pairs live in
[cross-runtime-parity.md](cross-runtime-parity.md).

Algorithm (current):
1. Lowercase + German umlaut transliteration (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`).
2. NFKD normalisation + strip combining marks (remaining diacritics).
3. Replace `[^a-z0-9]+` with `-`, trim leading/trailing `-`, collapse multiple `-`.

## Frontend conventions

Only what is tenancy-specific lives here. The general SPA conventions — routing, guards, the
`[slug]` shell, state, testing — are in [frontend.md](frontend.md) and its siblings.

### Community URLs live under `/c/`

```
Backend (Caddy → core)   /api/*   /oauth2/*   /login/*   /logout
App pages (root)         /   /login   /communities   /communities/new
                         /super-admin   /super-admin/communities
                         /super-admin/users   /super-admin/users/:id   /join/:token
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

The tenant context is resolved by `registerCommunityDataGuard`, a **router guard** rather than the
shell page — the mechanics are in [frontend-routing.md](frontend-routing.md). Two things about it
are tenancy-specific: it matches on the *param*, not on a path, which is why the `/c/` move did not
touch it; and a 404 renders "Kein Zugriff" rather than "not found", so membership is not leaked —
matching the backend.

### Last-selected community

After the router guard (`registerCommunityDataGuard`'s `afterEach` in `src/communities/routeData.ts`)
publishes a resolved community, it calls `setSelection(community.id)` — fire-and-forget with respect
to the navigation, but tracked in `pendingSelectionWrite` so `landingGuard.ts` can await it instead of
racing it. The `useCommunities().landing()` composable uses the server-side selection to pick the
last-visited community when the user has multiple active memberships.

### Post-login redirect flow (`/` resolver)

`src/pages/index.vue` is a redirect resolver, not a landing page. It calls
`useCommunities().landing()` and routes:
- `none` / `choose` → `/communities` (chooser).
- `one` / `last` → `/c/<slug>/` (via `communityPath`).
