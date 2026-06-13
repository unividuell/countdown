# Communities (Multi-Tenancy Foundation)

**Status:** Approved design (2026-06-13)
**Module:** new backend Spring Modulith module `community` (schema `community`) + frontend routing/context
**Depends on:** `iam` module (`UserQuery`, `CountdownOAuth2User` principal, `ROLE_SUPER_ADMIN`)

## Purpose

Make the app multi-tenant. A tenant is a **community** (Spielgemeinschaft). The origin app
(`huettehuette.unividuell.org`) had exactly one implicit community — the Firestore
`huettehuette/meta` doc with `startsAt` (TZ-sensitive countdown start) and `startRound` /
`points.phase2.startingRound`. This effort turns that implicit config into a first-class,
named, multi-tenant entity with membership, admin roles, invitations, and URL-based context.

**Scope of THIS spec: the community foundation only** — the tenant entity, membership,
admin roles, invite + approval, and context resolution / routing / switching. The per-community
countdown/game/points logic is explicitly **out of scope** (a later, separate spec that builds
on this foundation).

## Decisions (locked during brainstorming)

- **Attributes:** `name` (required, 3..50 chars), `slug` (url-safe, derived, **immutable**,
  the **only** unique field), `startsAt` (timestamptz, optional), `phaseTwoStartRound`
  (positive int, optional). Only `name` is required.
- **Uniqueness:** only the **slug** is unique (no unique constraint on `name`). Identical names
  collide via the slug → creation rejected (user adjusts the name).
- **Slug on rename:** **immutable**. Editing the name never changes the slug (protects
  bookmarks + shared invite links).
- **Membership:** a user can belong to many communities. Membership has `status`
  (`PENDING` | `ACTIVE`) and `is_admin` (boolean, **additional** to being a player — every
  ACTIVE member is a player; admin is on top). Each community has **≥1 admin** at all times.
- **Creation:** any logged-in user can create a community and becomes its first ACTIVE admin.
  The global `SUPER_ADMIN` has implicit admin access to **all** communities.
- **Admin management:** equal admins; any admin can promote a player to admin or demote an
  admin; the **last** admin cannot be demoted/removed/leave (last-admin protection).
- **Removal:** admins can remove members; members can self-leave; last-admin protection applies.
- **Invite:** one **reusable** shareable link per community, **fixed 7-day** expiry,
  regenerable (regenerating replaces the token = revoke). Accepting (while logged in) creates a
  **PENDING** membership; an admin must confirm → ACTIVE.
- **Foreign slug:** a logged-in non-member visiting `/<slug>/` directly gets a **no-access page**
  (404-style, no info leak). Joining is only via the invite link.
- **Last-selected community:** persisted **server-side per user** (in the community module, not
  in `iam`), used for the post-login redirect.
- **Context model:** the **URL slug is the source of truth** (approach A). The path is
  `/<slug>/…` whenever in community context; a route guard resolves slug→community and checks
  active membership per navigation. No hidden session "active community".

## Architecture

New Spring Modulith module **`community`**, following the `iam` pattern: public types at the
package root (aggregates + read-only query interfaces) and an `internal/` subpackage for
services, repositories, controllers. Own Postgres **schema `community`** with module-based
Flyway migrations (`db/migration/community/`). Depends on `iam` via its public `UserQuery`.
Exposes a public API for future modules:

```kotlin
// public module API (package org.unividuell.countdown.core.community)
interface CommunityQuery {
    fun findBySlug(slug: String): Community?
    fun findById(id: UUID): Community?
}
interface MembershipQuery {
    fun isActiveMember(communityId: UUID, userId: UUID): Boolean
    fun isAdmin(communityId: UUID, userId: UUID): Boolean
    fun activeCommunitiesOf(userId: UUID): List<Community>
}
```

Tenancy is **shared-schema with `community_id` scoping** (no schema-per-tenant) — the right fit
because users span many communities. Cross-cutting game data (later specs) will carry a
`community_id`.

### Data model (schema `community`)

```
communities
  id                     UUID PK DEFAULT uuidv7()
  name                   TEXT NOT NULL                      -- 3..50 chars (app-validated)
  slug                   TEXT NOT NULL UNIQUE               -- derived, lowercase, url-safe, immutable
  starts_at              TIMESTAMPTZ NULL                   -- optional
  phase_two_start_round  INT NULL                           -- optional, > 0 (app-validated)
  invite_token           TEXT NULL UNIQUE                   -- current reusable link token (null = none)
  invite_token_expires_at TIMESTAMPTZ NULL
  created_by             UUID NOT NULL                      -- iam.users.id (creator)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()

community_members
  id            UUID PK DEFAULT uuidv7()
  community_id  UUID NOT NULL  -> communities(id)
  user_id       UUID NOT NULL                              -- iam.users.id
  status        TEXT NOT NULL                              -- 'PENDING' | 'ACTIVE'
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (community_id, user_id)

community_user_selection                                    -- last-selected, per user
  user_id       UUID PK                                    -- iam.users.id
  community_id  UUID NOT NULL  -> communities(id)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
```

No FK to `iam.users` is declared across the schema boundary (module hygiene — `user_id`/
`created_by` reference iam logically; integrity enforced in app/service layer, consistent with
modulith boundaries). FKs **within** the `community` schema (members→communities,
selection→communities) are declared.

**Invariants:** the creator row is inserted `status=ACTIVE, is_admin=true`. A community always
has ≥1 `ACTIVE, is_admin=true` member (enforced in the service layer: demote/remove/leave of the
last admin → rejected). Only ACTIVE members are players; PENDING members are not yet players.

## Slug derivation (server-authoritative; client mirrors for live preview)

Single tested function per side (Kotlin = source of truth, TS = preview); parity covered by tests.

1. lowercase
2. transliterate German umlauts: `ä→ae, ö→oe, ü→ue, ß→ss`
3. strip remaining diacritics (NFKD + drop combining marks)
4. replace runs of non-`[a-z0-9]` with a single `-`
5. trim leading/trailing `-`; collapse repeated `-`

The result must be **≥3 chars** (else validation error). A **reserved-slug blocklist**
(`api`, `oauth2`, `login`, `logout`, `communities`, `join`, plus any top-level SPA route names)
is rejected. On `POST` the server derives + validates + checks uniqueness; a taken or reserved
slug → **409** ("Bitte Namen anpassen"). Slug is set once at creation and never recomputed.

## Flows

1. **Login redirect** (SPA after auth): load active memberships.
   - 0 active → `/communities` (message page: create + a **generic** hint "got an invite? open
     the link" — no pending data is fetched, keeping `GET /communities` = active only).
   - exactly 1 → `/<slug>/`.
   - >1 → last-selected if still active → `/<slug>/`; else chooser at `/communities`.
   - A member who is only PENDING somewhere counts as 0 active → lands on the message page.
2. **Create**: name input + live slug preview → `POST /api/communities {name}`. Validation
   (name 3..50, derived slug ≥3, slug unique, not reserved). Slug taken/reserved → 409. Success
   → creator becomes ACTIVE admin → redirect `/<slug>/`.
3. **Switch**: switcher dropdown in the community shell lists active communities + "create new";
   selecting sets last-selected (`PUT /api/communities/selection`) + navigates `/<slug>/`.
4. **Invite generate** (admin): `POST /api/communities/{slug}/invite` → `{ url: …/join/<token>,
   expiresAt }` (7 days). Re-calling replaces the token (revoke); `DELETE` revokes.
5. **Invite accept**: visiting `/join/<token>` (login required; else OAuth then back) →
   `POST /api/communities/join/<token>`. The joiner doesn't know the slug, so the token is
   looked up globally; the response carries the community `name` + `slug` for the rendered page.
   Outcomes: invalid/expired → error page; already ACTIVE → redirect `/<slug>/`; already
   PENDING → "waiting" page; else create PENDING → "request submitted, waiting for approval".
6. **Manage members** (admin, settings → members): `GET …/members` (active + pending); approve
   pending; promote/demote `is_admin`; remove; self-leave — all with last-admin protection.
7. **Edit community** (admin): `PATCH /api/communities/{slug}` { name?, startsAt?,
   phaseTwoStartRound? }. Name editable, slug unchanged.

## REST API (under `/api`, session + CSRF per existing contract)

| Method | Path | Authorization |
| --- | --- | --- |
| POST | `/communities` | ROLE_USER (becomes admin) |
| GET | `/communities` | own ACTIVE memberships |
| GET · PUT | `/communities/selection` | self |
| GET | `/communities/{slug}` | ACTIVE member or super-admin (else 404) |
| PATCH | `/communities/{slug}` | admin |
| POST · DELETE | `/communities/{slug}/invite` | admin |
| POST | `/communities/join/{token}` | ROLE_USER |
| GET | `/communities/{slug}/members` | ACTIVE member |
| POST | `/communities/{slug}/members/{userId}/approve` | admin |
| POST | `/communities/{slug}/members/{userId}/promote` · `/demote` | admin (last-admin guard) |
| DELETE | `/communities/{slug}/members/{userId}` | admin (other) / self (leave); last-admin guard |

A central `CommunityAccess` service resolves (principal user id + slug) → membership/admin,
with the super-admin override. Responses use DTOs (no entity leakage), mirroring `iam`'s
`MeResponse`/controller style.

**Error handling:** 400 (validation: name length, slug too short, phaseTwoStartRound ≤ 0);
409 (slug taken/reserved, last-admin violation); 404 (no access to slug — no info leak);
403 (authenticated but not admin where admin required); invite invalid/expired → a specific
error payload the SPA renders as a friendly page.

## Frontend (Vue Router 5, file-based; per frontend guidelines — composables/VueUse, `apiFetch`/`useAuth`)

Routes:
- `/` → post-login redirect resolver (logic above).
- `/communities` → message/chooser page (no active community) + create entry.
- `/communities/new` → create form with live slug preview (client slug fn mirroring server).
- `/join/[token]` → accept-invite page.
- `/[slug]/` → **community shell** with a route guard (resolve slug + active membership via API;
  non-member → no-access page). Child routes (settings, members) rendered/allowed for admins only.
- a shared no-access / not-found page.

Static routes (`/communities`, `/join`) take precedence over the dynamic `/[slug]`; the
reserved-slug blocklist is the backstop. A **switcher** component lives in the community shell
header (active communities + "create new"). The slug live-preview uses a TS port of the slug
function, kept in parity with the Kotlin one by tests.

## Testing

**Backend** (mockk + kotest + MockMvc Kotlin DSL + Testcontainers, TDD):
- slug derivation rules (umlauts, diacritics, collapsing, min-length, reserved blocklist)
- slug uniqueness + rejection on collision
- membership lifecycle PENDING → ACTIVE; creator becomes ACTIVE admin
- last-admin invariants (demote/remove/leave of last admin rejected)
- invite generation, 7-day expiry, regenerate-revokes-old, accept paths (valid/expired/already
  member/already pending)
- authorization matrix per endpoint incl. super-admin override and no-access 404
- selection get/set + login-redirect resolution counts

**Frontend** (Vitest + `vi`):
- slug preview function parity with the documented rules
- login-redirect logic (0 / 1 / >1 / pending-only / stale last-selected)
- route guard (member vs non-member → no-access)
- create flow (live preview, 409 handling), join flow (states), switcher

## Out of scope / follow-ups

- Per-community countdown/game/points logic (`startsAt` daily-round Europe/Berlin DST semantics,
  `phaseTwoStartRound` point calculation) — a separate spec on top of this foundation.
- Per-invite (single-use/personalized) tokens — current model is one reusable link per community.
- Email/notification on invite or approval.
- Cross-device "active community" beyond the persisted last-selected.

## Feed knowledge back

After implementation, capture into `.claude/guidelines/`: the multi-tenant `community_id`
scoping convention, the slug-derivation parity rule (Kotlin source of truth + TS mirror + parity
test), the module-API pattern for cross-module read access (`CommunityQuery`/`MembershipQuery`),
and the URL-slug-as-context-source routing/guard pattern.
