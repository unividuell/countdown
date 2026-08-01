# Super-Admin Area: Overview + Community List

**Status:** Approved design (2026-08-01)
**Builds on:** the `community` module (communities, members) and `iam` (`is_super_admin` flag, `ROLE_SUPER_ADMIN`, the `SUPER_ADMIN_GITHUB_LOGINS` allowlist, the reserved `/api/super-admin/**` security rule).
**Depends on:** `community` module, `iam` (`AuthenticatedUser`, `UserQuery`, `SuperAdminProperties`).

## Purpose

Super-admins today have override rights everywhere (`CommunityAccess` lets them pass
`requireActiveMember`/`requireAdmin` for any community) but no way to *see* the system as a
whole — they must know a slug to look at a community, and there is no way to check who else
holds the role.

This feature adds a small super-admin area with two screens:

1. **`/super-admin`** — a landing page listing everyone who holds (or is configured to hold)
   super-admin rights, plus a link onward.
2. **`/super-admin/communities`** — every community with its complete member roster, marking
   each community's admins.

The area is deliberately **unlinked** — reachable only by typing the URL. It is **read-only**:
super-admins already reach every mutation through the normal community pages.

## Decisions (locked during brainstorming)

- **Two pages behind one shell.** `src/pages/super-admin.vue` is a layout in the style of
  `[slug].vue`: it performs the `isSuperAdmin` check **once**, renders the "Kein Zugriff" branch
  or a small header with a link back to the landing page, and hosts `<RouterView/>`. The
  children (`super-admin/index.vue`, `super-admin/communities.vue`) contain no access logic.
- **Landing page content:** the super-admin roster and a link to the community overview.
  Nothing else for now.
- **The roster shows DB flag *and* allowlist, with divergences named.** `is_super_admin` is
  re-derived from `SUPER_ADMIN_GITHUB_LOGINS` on **every login**, so the two sources drift: a
  newly allowlisted person has no flag until their first login, and a removed person keeps the
  flag until their next one. The page shows the union and marks which source each row comes
  from — that discrepancy is precisely what this screen is for.
- **Community overview layout:** a single page, everything expanded — all communities below one
  another, each with its full member table. No accordion, no list/detail split. One request,
  Ctrl+F-searchable. Revisit if the number of communities outgrows one page.
- **Member columns:** display name · GitHub login · status · admin marker · member since.
  The GitHub login is included because display names can collide; email is **excluded**
  (personal data on a page that is easy to screenshot).
- **Read-only, with deep links:** no mutating endpoints in the super-admin namespace. Each
  community heading links to `/<slug>/` and `/<slug>/settings`, which is where every change —
  including the invite link — already lives.
- **No invite link on the community page.** Considered and dropped: each community's settings
  page already shows and manages it, and the deep link gets you there in one click.
- **One controller per owning module.** The community payload is community data → a
  `SuperAdminController` under `community/internal`. The roster is user data → a
  `SuperAdminUserController` under `iam/internal`. Rejected for the community endpoint: a
  separate `superadmin` module (would require widening the shared API with
  `CommunityQuery.findAll()` + `MembershipQuery.membersOf()` — a "give me everything" port
  existing solely for one UI) and a flag on the existing endpoint (`?all=true`, which moves
  authorization out of `SecurityConfig` into a service and makes one endpoint serve two roles).
  **Rule for later super-admin features:** each module contributes its own controller under
  `/api/super-admin/…`; the security rule stays central in `iam`.
- **Non-super-admin access:** the shell renders a "Kein Zugriff" screen (the same shape as the
  `no-access` branch in `[slug].vue`) and no child page ever calls the API. The backend 403 is
  the real gate.

## Architecture

No new module, no new table, no migration. Two new backend endpoints, one frontend shell with
two pages.

### Backend A — `GET /api/super-admin/communities` (`community` module)

New `SuperAdminController` + `SuperAdminOverviewService`, both under `community/internal`.

Authorization is handled **entirely** by the existing rule
`authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))` in `iam.internal.SecurityConfig`.
The controller adds no check of its own and takes no `AuthenticatedUser` parameter — anything
reaching it is already a super-admin. The same holds for Backend B.

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

### Backend B — `GET /api/super-admin/super-admins` (`iam` module)

New `SuperAdminUserController` + `SuperAdminRosterService` under `iam/internal`. Both
`UserRepository` and `SuperAdminProperties` already live in that package, so this needs no
cross-module plumbing at all.

```json
[
  { "githubLogin": "clemens",   "username": "Clemens", "userId": "...", "flagged": true,  "allowlisted": true,  "createdAt": "..." },
  { "githubLogin": "newperson", "username": null,      "userId": null,  "flagged": false, "allowlisted": true,  "createdAt": null },
  { "githubLogin": "oldperson", "username": "Old",     "userId": "...", "flagged": true,  "allowlisted": false, "createdAt": "..." }
]
```

The response carries the two raw facts (`flagged` = the DB column, `allowlisted` = present in
`SUPER_ADMIN_GITHUB_LOGINS`) rather than a pre-computed status. The four combinations are the
complete truth and the German wording is presentation, so the label mapping lives in the page.
`createdAt` is the user's, and is `null` for an allowlist entry that has never logged in.

**Two queries, merged in Kotlin:**

1. All flagged users, via an explicit
   `@Query("SELECT * FROM iam.users WHERE is_super_admin = true")`. A derived
   `findByIsSuperAdminTrue()` is **not** used: the property is already named `isSuperAdmin`, and
   Spring Data treats a leading `Is` as an ignorable keyword, so the derived name is ambiguous.
   Explicit SQL follows the `countActiveAdmins` precedent in `CommunityMemberRepository`.
2. All users matching the allowlist. **`findByGithubLoginIn` cannot be reused**: it matches
   case-sensitively, while `SuperAdminProperties.isSuperAdmin` compares with
   `ignoreCase = true`. A new `@Query("SELECT * FROM iam.users WHERE lower(github_login) IN
   (:logins)")` fed with lowercased allowlist entries keeps the endpoint consistent with the
   rule that actually grants the role. Without this, an allowlist entry `BossUser` against a
   stored `bossuser` would produce two rows for one person.

Rows are merged on the **lowercased** GitHub login for the same reason, and sorted by
`githubLogin`. An empty allowlist is legitimate (the default) and simply contributes no rows.

**Also:** add `"super-admin"` to `Slugs.RESERVED`. The frontend route `/super-admin` is a
static sibling of `[slug].vue` and wins route matching, so a community with that slug would
otherwise be unreachable.

### Frontend (`webapp-vue`)

| File | Role |
| --- | --- |
| `src/pages/super-admin.vue` (new) | Shell: access check, header, `<RouterView/>` |
| `src/pages/super-admin/index.vue` (new) | Roster + link to the community overview |
| `src/pages/super-admin/communities.vue` (new) | Community overview |
| `src/api/superAdmin.ts` (new) | `listSuperAdmins()`, `listAllCommunities()` |
| `src/api/types.ts` | `SuperAdminUser`, `SuperAdminCommunity`, `SuperAdminMember` |

Vue Router matches the static `/super-admin` before the dynamic `/:slug`, and the
`super-admin.vue` + `super-admin/*.vue` pairing is the same layout mechanism already used by
`[slug].vue`. **No changes** to `guard.ts`, `router-meta.d.ts`, navigation, the `[slug]` shell,
or `CommunitySwitcher`. Nothing links into this area.

**Shell** — reads `useAuth().user?.isSuperAdmin`. If false, it renders "Kein Zugriff" and does
not render `<RouterView/>` at all, so no child ever issues a request. Otherwise: a header with
the title and a `RouterLink` to `/super-admin`, then the child page.

**Landing page** — a table of the roster (**GitHub · Name · Status · seit**) plus a
`RouterLink` to `/super-admin/communities`. The status column maps the two booleans:

| flagged | allowlisted | Label |
| --- | --- | --- |
| ✓ | ✓ | Aktiv |
| ✗ | ✓ | Wartet auf ersten Login |
| ✓ | ✗ | Nicht mehr auf der Allowlist — Flag erlischt beim nächsten Login |

**Community page** — per community: a heading with the name and `/<slug>/`, links to
`/<slug>/` and `/<slug>/settings`, then the member table **Name · GitHub · Status · Admin ·
seit**. Admins get a badge in the Admin column, `PENDING` a visually distinct status badge. A
community with no members renders a short hint instead of an empty table.

Both pages carry their own `loading` / `ready` / `error` state; the shell owns only access.

**Time formatting:** `joinedAt` is rendered with Luxon in the community's `startsAtTimezone`,
not the browser zone — consistent with the project rule, and deterministic in tests regardless
of the CI machine's zone. The roster's `createdAt` has no community context, so it is rendered
in `Europe/Berlin` — the same default the `community` schema uses for `starts_at_timezone`.

## Testing

**Backend** (mockk + kotest + MockMvc Kotlin DSL + Testcontainers, matching
`CommunityControllerTest`):

- Both endpoints return 403 for an authenticated non-super-admin.
- `/communities`: 200 for a super-admin; payload shape, `isAdmin` and `status` per member.
- `/communities`: ordering — communities by name; admins before active before pending.
- `/communities`: a community with no members serializes as an empty `members` array.
- `/communities` service test: users are resolved in **one** batch call (`verify(exactly = 1)`
  on `UserQuery.findAllById`), and a member whose user row is missing does not break the
  response.
- `/super-admins`: a flagged, allowlisted user yields one row with both booleans true.
- `/super-admins`: an allowlist entry with no user row yields `userId: null`, `flagged: false`.
- `/super-admins`: a flagged user missing from the allowlist yields `allowlisted: false`.
- `/super-admins`: allowlist `BossUser` against stored `bossuser` yields **one** row — the
  regression guard for the case-insensitive merge.
- `/super-admins`: an empty allowlist returns only flagged users.

**Frontend** (Vitest + `vi` + `@vue/test-utils`, mocking `@/api/superAdmin` and `@/auth/useAuth`):

- Shell: a non-super-admin sees "Kein Zugriff", and the child route is not rendered.
- Landing: the three flag/allowlist combinations render their distinct labels; the link points
  at `/super-admin/communities`.
- Communities: one section per community, one row per member; the admin marker appears exactly
  on admin rows; pending members are marked as pending.
- Communities: `joinedAt` is formatted in the community's zone (fixture zone differs from UTC,
  so dropping `{ zone }` turns the test red).
- Both pages: an API failure renders the error state rather than an unhandled rejection.

## Out of scope

- Any mutation from these pages (approve, remove, promote, rename, invite handling).
- Editing the super-admin allowlist from the UI — it stays a deployment-time environment
  variable, re-applied to `is_super_admin` on every login.
- Pagination, search, filtering, sorting controls.
- A navigation link, menu entry, or any other discoverable entry point.
- An email column.
- Super-admin views of anything beyond communities and the roster (countdown diagnostics,
  session inspection).
