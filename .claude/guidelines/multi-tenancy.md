# Multi-Tenancy (Community Module)

The app is multi-tenant: a **`community`** (Spielgemeinschaft) is the first-class tenant.
Every feature that scopes data to a tenant carries a `community_id`.

## Backend conventions

- **Other modules read through the `community` module's public API** — `CommunityQuery`,
  `MembershipQuery` — never its `.internal`. Migration ordering follows that dependency
  ([modules-and-migrations.md](modules-and-migrations.md)).
- **`CommunityAccess` (internal) is the authorization resolver.** Services gate every read and
  write behind it before touching a repository:

  ```kotlin
  // → Community, or CommunityAccessDeniedException (404), or NotAdminException (403)
  access.requireActiveMember(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
  access.requireAdmin(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
  ```

- **A non-member gets the same 404 as "community does not exist"** — no information leak.
  A super-admin bypasses both checks.
- **`community_id` scoping rule.** A table holding per-community data carries a non-null FK:

  ```sql
  community_id UUID NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE
  ```

## Slug derivation — parity rule

The slug is **derived once at creation** from the community name and never changed. Kotlin
(`Slugs.slugify`) is the source of truth; the TypeScript mirror (`src/lib/slugify.ts`) changes in
the same commit, and `slugify.spec.ts` runs the cases of `SlugsTest.kt`. The general rules for such
pairs: [cross-runtime-parity.md](cross-runtime-parity.md).

## Frontend conventions

Only what is tenancy-specific; the SPA conventions are in [frontend.md](frontend.md) and siblings.

- **Communities are confined below `/c/`; the root namespace belongs to app pages.** A slug cannot
  shadow a route, structurally. So adding a page requires no thought about slugs — there is no
  blocklist, and reintroducing one is not allowed: a decision about pages must never constrain
  what users may name their community.
- **Build community URLs with `communityPath(slug, sub?)`** (`src/communities/routes.ts`), never
  by interpolating a path.
- **The tenant context is resolved by a router guard,** `registerCommunityDataGuard`
  ([frontend-routing.md](frontend-routing.md)). It matches on the *param*, not a path, and a 404
  renders "Kein Zugriff" rather than "not found" — membership is not leaked, as on the backend.
- **Last-selected community:** after publishing a resolved community, the guard's `afterEach`
  calls `setSelection(community.id)` — fire-and-forget for the navigation, but tracked in
  `pendingSelectionWrite` so `landingGuard.ts` awaits it instead of racing it.
- **`/` is a redirect resolver, not a landing page** (`pages/index.vue`):
  `useCommunities().landing()` answers `none`/`choose` → `/communities`, `one`/`last` →
  `/c/<slug>/`.
