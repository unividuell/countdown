# Communities move out of the Root Route Namespace

**Status:** Approved design (2026-08-02)
**Closes:** [#8](https://github.com/unividuell/countdown/issues/8) — "Community-Slugs kollidieren mit
dem Routen-Namensraum der App"
**Builds on:** the navigation-flicker refactor (2026-08-02) — the community shell is now a thin
renderer over `communityRoute`, and route-derived state is owned by router guards.
**Scope:** `webapp-vue` routing plus one deletion in `core`. No database change, no migration —
the slug column is untouched; only the URL position of the slug changes.

## Purpose

Communities live at the root: `/:slug`. Every static route of the app therefore shares a namespace
with every conceivable community name, and Vue Router matches static segments first — so a community
whose slug collides with a page would be unreachable.

The stopgap is a blocklist in `core/.../community/internal/Slugs.kt`:

```kotlin
val RESERVED = setOf("api", "oauth2", "login", "logout", "communities", "join", "super-admin")
```

It grows with every new page, which is the wrong direction: a product decision about pages becomes a
constraint on what users may call their community. It is not safe either — whoever adds a page has to
remember to reserve its slug, or it silently shadows an existing community. And because
`Slugs.slugify` derives the slug from the name, it already rejects harmless input: "Super Admin",
"Super-Admin" and "SUPER  ADMIN" all become `super-admin`.

Communities move under a `/c/` prefix. The blocklist is then not merely shorter — it is unnecessary,
and it goes away entirely.

## Decisions (locked during brainstorming)

- **`/c/:slug`, not `/communities/:slug`.** The latter would still collide with `/communities/new`,
  reintroducing a one-entry blocklist — the same problem, smaller.
- **Not the inverse** (app pages behind `/app/…`, communities staying short at the root). `/api/*`,
  `/oauth2/*`, `/login/*` and `/logout` are proxied to the backend by Caddy and belong to the origin
  regardless of what Vue Router does. Moving app pages would shrink the blocklist to `api`, `oauth2`,
  `app` — but never to nothing.
- **`/communities` and `/communities/new` stay where they are.** Two spellings for one concept is
  acceptable here because they serve different purposes: `/communities/*` are app pages, rarely
  typed and never shared; `/c/:slug` is the URL people paste to each other. The differing length
  mirrors the differing purpose, and the two trees cannot collide.
- **The blocklist is removed outright, with no replacement and no follow-up issue.** A content
  moderation blocklist (hate speech and the like) was considered and deliberately not folded in: it
  is a different mechanism — substring matching rather than exact match, a different error, and open
  questions about renaming, list maintenance and reporting. If it becomes necessary it gets designed
  then, rather than being pre-built as an empty hook.
- **A 404 page is in scope.** After the move, `/hhh` matches nothing and today's app would render a
  blank page — the app has no catch-all at all. The gap is created by this change, so it is closed
  by this change.

## Route Map

```
Backend (Caddy → core)   /api/*   /oauth2/*   /login/*   /logout
App pages (root, free)   /   /login   /communities   /communities/new
                         /super-admin   /super-admin/communities   /join/:token
Communities              /c/:slug/   /c/:slug/members   /c/:slug/requests   /c/:slug/settings
Anything else            404
```

The invariant this establishes: **no slug can ever shadow an app route, because slugs only occur
below `/c/`.** Not "nothing collides right now" — structurally impossible. New pages need no check
against a list, and no page author has to think about slugs at all.

Caddy needs no change. Its `@backend path /api/* /oauth2/* /login/* /logout /logout/*` matcher is
mutually exclusive with `/c/*`, and the SPA catch-all already serves `index.html` for everything else.

## Backend

`Slugs.RESERVED` and `Slugs.isReserved` are deleted; `Slugs.kt` retains only `slugify`. The check in
`CommunityService.create` (currently line 24) goes with them. `SlugUnavailableException` stays — it
still carries the "already taken" case, which is unrelated.

Nothing else in `core` is affected. The backend never builds community URLs: the only URL it emits is
the invite link `/join/{token}` (`MemberController`), which is an app page and does not move.

## Frontend

### File moves

```
src/pages/[slug].vue                 →  src/pages/c/[slug].vue
src/pages/[slug]/index.vue           →  src/pages/c/[slug]/index.vue
src/pages/[slug]/members.vue         →  src/pages/c/[slug]/members.vue
src/pages/[slug]/requests.vue        →  src/pages/c/[slug]/requests.vue
src/pages/[slug]/settings.vue        →  src/pages/c/[slug]/settings.vue
src/pages/[slug]/__tests__/*         →  src/pages/c/[slug]/__tests__/*
src/pages/__tests__/slug-shell.spec.ts  →  src/pages/c/__tests__/slug-shell.spec.ts
```

Typed route names follow the paths: `useRoute('/[slug]')` becomes `useRoute('/c/[slug]')`, and so on
for the child pages. `typed-router.d.ts` is generated and committed — it regenerates on the next dev
or build run and the regenerated file is part of the change.

`src/communities/routeData.ts` needs **no change**. Its `slugOf(route)` reads `route.params.slug`
from whatever route committed, without caring where in the path the segment sits; after the move the
only routes carrying a `slug` param are the `/c/[slug]/*` ones. The same holds for
`registerNavigationProgress` and `registerAuthGuard`.

### One place that builds community URLs

Eleven call sites currently interpolate `` `/${slug}/` `` by hand:

| File | Occurrences |
|---|---|
| `src/communities/CommunityMenu.vue` | 4 |
| `src/pages/super-admin/communities.vue` | 2 |
| `src/communities/useAdminGuard.ts` | 1 |
| `src/communities/landingGuard.ts` | 1 |
| `src/pages/join/[token].vue` | 1 |
| `src/pages/communities/index.vue` | 1 |
| `src/pages/communities/new.vue` | 1 |

Rather than sprinkling the prefix across eleven sites, a new `src/communities/routes.ts` exports

```ts
export function communityPath(slug: string, sub?: 'members' | 'requests' | 'settings'): string
```

returning `/c/<slug>/` or `/c/<slug>/<sub>`, and every call site uses it. The prefix then exists in
exactly one place. This is the reason the change is cheap to make and would be cheap to revisit — the
current spread is what makes a scheme change feel expensive.

`communityPath` is a pure string function with no router dependency, so it is unit-testable on its own.

### 404 page

`src/pages/[...path].vue`, declaring `definePage({ meta: { public: true } })`.

Public matters: the auth guard stashes the intended destination for the post-login redirect, so a
non-public catch-all would send an anonymous visitor who mistyped a URL through GitHub login only to
land on the 404 anyway. A wrong address is not a reason to authenticate.

Content is deliberately plain — a heading, one sentence, and a link back to `/`. It renders inside the
existing app header like any other page.

## Testing

TDD throughout; the backend and frontend halves are independent and can be done in either order.

**Backend**
- `SlugsTest`: the three `isReserved` assertions go; the `slugify` cases stay untouched.
- `CommunityServiceTest`: a regression test that a community named "Super Admin" can now be created —
  this is the user-visible behaviour the issue complains about, and it should fail before the change.
- `CommunityControllerTest`: drop the reserved-slug 409 case if one exists.

**Frontend**
- New: `communityPath` unit test — the base path, each sub-path, and that the `/c/` prefix is present
  (so a future accidental revert to root-level paths fails loudly).
- New: 404 page test — renders for an unmatched path, and is reachable while anonymous
  (`meta.public`), which is the part that would silently regress.
- Moved: the three specs under `pages/[slug]/__tests__/` (`members`, `requests`, `settings`) and
  `slug-shell.spec.ts`, with their dynamic `import('@/pages/[slug]/…')` paths updated.
- Updated expectations, from `/<slug>/` to `/c/<slug>/`: `pages/__tests__/index.spec.ts`,
  `pages/join/__tests__/token.spec.ts`, `pages/communities/__tests__/new.spec.ts`,
  `pages/super-admin/__tests__/communities.spec.ts`,
  `communities/__tests__/CommunityMenu.spec.ts`, `communities/__tests__/landingGuard.spec.ts`.
- `communities/__tests__/routeData.spec.ts` and `communities/__tests__/landingGuard.spec.ts` both
  build memory routers with a `/:slug` record (`routeData.spec.ts:44`, `landingGuard.spec.ts:41`).
  Those records move to `/c/:slug` so the tests keep mirroring the real file-based layout — even
  though neither `routeData.ts` nor the guard logic itself changes.

## Documentation

`.claude/guidelines/multi-tenancy.md` is the real home for this rule — its "URL-slug-as-context
routing" section currently documents the very invariant this change removes:

- Line 65 (reserved slugs rejected at creation) is deleted.
- Lines 70–82 are rewritten for `/c/:slug`. In particular the claim that "static routes take priority
  over the dynamic `:slug` segment — Vue Router 5 matches them first" stops being load-bearing: it
  remains true of Vue Router, but the app no longer depends on it for correctness.
- Line 96 (`one`/`last` → `/<slug>/`) becomes `/c/<slug>/`.
- The section gains the rule itself: community URLs live under `/c/`, app pages own the root
  namespace, and a blocklist must not be reintroduced — adding a page is not allowed to constrain
  what users may name their community.

`.claude/guidelines/frontend.md` line 216 — the note telling page authors to add their slug to
`Slugs.RESERVED` — is deleted; it is exactly the obligation this change abolishes.

## Out of scope

- **Content moderation** of community names. See the decision above.
- **Redirects from the old scheme.** The app is not in production and the issue explicitly waives
  consideration for existing communities; `/hhh` gets the 404 like any other unmatched path.
- **Renaming `/communities` or `/communities/new`.** Decided above.
- **Making slugs editable.** They remain derived once at creation and immutable.
