# Super-Admin Area: Community Overview

**Status:** Approved design (2026-08-01)
**Builds on:** the `community` module (communities, members, invites) and `iam` (`is_super_admin` flag, `ROLE_SUPER_ADMIN`, the reserved `/api/super-admin/**` security rule).
**Depends on:** `community` module, `iam` (`AuthenticatedUser`, `UserQuery`).

## Purpose

Super-admins today have override rights everywhere (`CommunityAccess` lets them pass
`requireActiveMember`/`requireAdmin` for any community) but no way to *see* the system as a
whole — they must know a slug to look at a community. This feature adds the first screen of a
super-admin area: one page listing **every** community with its **complete member roster**,
marking each community's admins.

The area is deliberately **unlinked** — reachable only by typing the URL. It is **read-only**:
super-admins already reach every mutation through the normal community pages.

## Decisions (locked during brainstorming)

- **Layout:** a single page, everything expanded — all communities below one another, each with
  its full member table. No accordion, no list/detail split. One request, Ctrl+F-searchable.
  Revisit if the number of communities outgrows one page.
- **Member columns:** display name · GitHub login · status · admin marker · member since.
  The GitHub login is included because display names can collide; email is **excluded**
  (personal data on a page that is easy to screenshot).
- **Read-only, with deep links:** no mutating endpoints in the super-admin namespace. Each
  community heading links to `/<slug>/` and `/<slug>/settings`, which is where every change —
  including the invite link — already lives.
- **No invite link on this page.** Considered and dropped: the settings page of each community
  already shows and manages it, and the deep link gets you there in one click.
- **Backend home = the `community` module.** The payload is entirely community data, so a
  `SuperAdminController` under `community/internal` serves `/api/super-admin/communities`.
  Rejected: a separate `superadmin` module (would require widening the shared API with
  `CommunityQuery.findAll()` + `MembershipQuery.membersOf()` — a "give me everything" port
  existing solely for one UI) and a flag on the existing endpoint (`?all=true`, which moves
  authorization out of `SecurityConfig` into a service and makes one endpoint serve two roles).
  **Rule for later super-admin features:** each module contributes its own controller under
  `/api/super-admin/…`; the security rule stays central in `iam`.
- **Non-super-admin access:** the page renders a "Kein Zugriff" screen (the same shape as the
  `no-access` branch in `[slug].vue`) and never calls the API. The backend 403 is the real gate.

## Architecture

No new module, no new table, no migration. One new backend endpoint, one new frontend page.

### Backend (`community` module)

**`GET /api/super-admin/communities`** — new `SuperAdminController` +
`SuperAdminOverviewService`, both under `community/internal`.

Authorization is handled **entirely** by the existing rule
`authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))` in `iam.internal.SecurityConfig`.
The controller adds no check of its own and takes no `AuthenticatedUser` parameter — anything
reaching it is already a super-admin.

Response body:

```json
[{
  "id": "...",
  "name": "Hütte 2026",
  "slug": "huette-2026",
  "startsAt": "2026-08-01T08:00:00Z",
  "startsAtTimezone": "Europe/Berlin",
  "createdAt": "...",
  "members": [{
    "userId": "...",
    "username": "Clemens",
    "githubLogin": "clemens",
    "status": "ACTIVE",
    "isAdmin": true,
    "joinedAt": "..."
  }]
}]
```

New DTOs in `community/internal` (alongside the existing ones in `CommunityDtos.kt`):
`SuperAdminCommunityResponse`, `SuperAdminMemberResponse`. `username` follows the existing
`User.username` rule (display name → GitHub name → GitHub login). `joinedAt` is the
membership's `createdAt`, not the user's. A membership whose user row cannot be resolved still
yields a row, with `username` and `githubLogin` set to `"?"` — mirroring the existing
`MemberController` fallback, so a dangling reference stays visible instead of vanishing.

**Three queries in total, independent of the number of communities:**

1. `CommunityRepository.findAll()`
2. `CommunityMemberRepository.findAll()`, grouped in Kotlin by `communityId`
3. `UserQuery.findAllById(ids)` — **new batch method on the exposed `iam.UserQuery` port**
   (only `findById` exists today), implemented in `UserQueryService` via
   `repository.findAllById(ids)`.

The batch user lookup is the reason for the port addition: the existing
`MemberController.members()` resolves one user per row, which is an N+1 that becomes
system-wide on this page.

**Ordering** (stable output, asserted in tests):

- communities by `name`, case-insensitive;
- members: admins first, then other `ACTIVE`, then `PENDING`; alphabetical by `username`
  within each group.

**Also:** add `"super-admin"` to `Slugs.RESERVED`. The frontend route `/super-admin` is a
static sibling of `[slug].vue` and wins route matching, so a community with that slug would
otherwise be unreachable.

### Frontend (`webapp-vue`)

- **`src/pages/super-admin.vue` (new)** — the whole feature. Vue Router matches the static
  `/super-admin` before the dynamic `/:slug`, so no route config or guard change is needed.
- **`src/api/superAdmin.ts` (new)** — `listAllCommunities()`.
- **`src/api/types.ts`** — `SuperAdminCommunity`, `SuperAdminMember`.
- **No changes** to `guard.ts`, `router-meta.d.ts`, navigation, the `[slug]` shell, or
  `CommunitySwitcher`. Nothing links here.

Page states: `no-access` (checked first, from `useAuth().user.isSuperAdmin`; the API is not
called at all) → `loading` → `ready` / `error`.

Per community: a heading with the name and `/<slug>/`, links to `/<slug>/` and
`/<slug>/settings`, then the member table **Name · GitHub · Status · Admin · seit**. Admins get
a badge in the Admin column, `PENDING` a visually distinct status badge. A community with no
members renders a short hint instead of an empty table.

**Time formatting:** `joinedAt` is rendered with Luxon in the community's `startsAtTimezone`,
not the browser zone — consistent with the project rule, and deterministic in tests regardless
of the CI machine's zone.

## Testing

**Backend** (mockk + kotest + MockMvc Kotlin DSL + Testcontainers, matching
`CommunityControllerTest`):

- `GET /api/super-admin/communities` returns 403 for an authenticated non-super-admin.
- 200 for a super-admin; payload shape, `isAdmin`, and `status` per member.
- Ordering: communities by name; admins before active before pending.
- A community with no members serializes as an empty `members` array.
- Service test: users are resolved in **one** batch call (`verify(exactly = 1)` on
  `UserQuery.findAllById`), and a member whose user row is missing does not break the response.

**Frontend** (Vitest + `vi` + `@vue/test-utils`, mocking `@/api/superAdmin` and `@/auth/useAuth`):

- Non-super-admin: renders "Kein Zugriff" and does **not** call the API.
- Super-admin: renders one section per community and one row per member.
- The admin marker appears exactly on admin rows; pending members are marked as pending.
- `joinedAt` is formatted in the community's zone (fixture zone differs from UTC, so dropping
  `{ zone }` turns the test red).
- API failure renders the error state rather than an unhandled rejection.

## Out of scope

- Any mutation from this page (approve, remove, promote, rename, invite handling).
- Pagination, search, filtering, sorting controls.
- A navigation link, menu entry, or any other discoverable entry point.
- An email column.
- Super-admin views of anything other than communities (users, countdown diagnostics).
- Changing how the `is_super_admin` flag is assigned — it stays derived from the
  `SUPER_ADMIN_GITHUB_LOGINS` allowlist on every login.
