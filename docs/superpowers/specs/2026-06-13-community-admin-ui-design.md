# Community Admin Management UI

**Status:** Approved design (2026-06-13)
**Builds on:** the communities foundation (`community` module + `/[slug]/` shell). Backend CRUD/invite/membership endpoints already exist; this effort makes the admin surface **reachable + admin-gated** and adds the small pieces still missing.
**Depends on:** `community` module, `iam` (`AuthenticatedUser`).

## Purpose

After the communities foundation shipped, the admin pages (`members.vue`, `settings.vue`) exist but are **unreachable** (the `/[slug]/` shell has no navigation to them) and **not admin-gated** (the backend never tells the frontend the caller's role, so admin controls render for everyone and are only blocked at the API with 403). This feature delivers a proper, reachable, admin-gated management surface.

## Decisions (locked during brainstorming)

- **Scope:** the complete admin UI — reachable + admin-gated — covering: pending-request approval, member management, invite-link management, rename + meta-field editing. Plus a minimal backend addition so the UI can gate (expose the viewer's role + a pending count + the current invite link).
- **Navigation:** a **⚙ "Verwalten" dropdown** in the `/[slug]/` shell header, **visible only to admins**, with entries **Anfragen ⟨pendingCount⟩ · Mitglieder · Einstellungen**. Non-admins see no ⚙ menu.
- **Member area is admin-only:** non-admins do not see the member roster at all. Consequently the backend `GET /{slug}/members` is **tightened from "any active member" to admin-only** (least-privilege, consistent with the UI).
- **Meta fields editable now:** settings edits `name` + `startsAt` + `phaseTwoStartRound` (the fields + PATCH already exist; admins may pre-configure even though the countdown/game logic is a later spec).
- **Invite link:** settings shows the **current active link** (URL + expiry + copy button), plus **regenerate** (replaces/revokes the old token) and **revoke**. Requires the backend to return the current invite (admin-only).
- **Pending requests:** a **dedicated "Anfragen" area** with a **count badge** on the ⚙ menu; each request can be **approved** or **rejected (= remove the pending membership)**.
- **Community name = home link:** the community name in the shell header (top-left) becomes a `RouterLink` to **`/`**, which routes via the post-login resolver back to the current (last-selected) community root.
- **Self-leave UI: deferred** (out of scope). Non-admins currently have no UI action to leave a community; a later feature adds it.
- **Context model unchanged:** URL slug is the source of truth; the shell resolves the community (and now the viewer's admin status) on entry.

## Architecture

The backend `community` module gets a small, focused enrichment; the rest is frontend wiring + gating in `webapp-vue`. No new tables, no new module.

### Backend changes (`community` module)

1. **Enrich the community detail** — `CommunityResponse` (returned by `GET /api/communities/{slug}`) gains:
   - `viewerIsAdmin: Boolean` — is the authenticated caller an admin of this community (super-admin ⇒ true).
   - `pendingCount: Int` — number of PENDING members (only meaningful for admins; `0` for non-admins).
   `CommunityController.get(slug)` resolves these via `MembershipQuery.isAdmin(...)` and (for admins) a count of PENDING members; non-admins always get `false`/`0`. The existing fields (`id, name, slug, startsAt, phaseTwoStartRound`) stay.

2. **`GET /api/communities/{slug}/invite` (NEW, admin-only)** — returns the current active invite as `{ url, expiresAt }`, or `null` if there is none / it has expired. Reuses the `InviteResponse` shape. (`POST` regenerate and `DELETE` revoke already exist.) The URL is built the same way as the existing `POST` (`/join/{token}`).

3. **Tighten `GET /api/communities/{slug}/members`** — change the authorization from `requireActiveMember` to **`requireAdmin`** (super-admin override still applies). Non-admin active members now get 403.

   A small repository/service addition may be needed for `pendingCount` (e.g. `CommunityMemberRepository.countByCommunityIdAndStatus(communityId, PENDING)` or a `@Query`); follow the existing `countActiveAdmins` pattern.

**Backend tests** (mockk + kotest + MockMvc DSL + Testcontainers):
- `GET /{slug}` returns `viewerIsAdmin=true` + correct `pendingCount` for an admin; `false`/`0` for a non-admin active member; super-admin ⇒ `true`.
- `GET /{slug}/invite` returns the current link for an admin, `null` when none/expired, 403 for a non-admin, 404 for non-member.
- `GET /{slug}/members` now 403s a non-admin active member; still works for admin + super-admin.

### Frontend changes (`webapp-vue`)

Routing is file-based; the shell is `src/pages/[slug].vue` with nested `src/pages/[slug]/*`.

1. **Shell `[slug].vue`:**
   - The community name (top-left) becomes `<RouterLink to="/">{{ name }}</RouterLink>`.
   - Add a **⚙ "Verwalten" dropdown**, rendered only when `community.viewerIsAdmin`, with links: **Anfragen** (showing a badge with `pendingCount` when > 0) · **Mitglieder** · **Einstellungen**. Keep the existing switcher + logout.
   - Expose the resolved community (incl. `viewerIsAdmin`, `pendingCount`) to child routes via `provide`/`inject` (a typed `injectionKey`), so the admin sub-pages and the guard can read the viewer role without re-fetching.

2. **Admin route guard:** navigating to `/[slug]/requests`, `/[slug]/members`, or `/[slug]/settings` as a non-admin redirects to `/[slug]/`. Implemented from the injected community context (the shell has already resolved it); the backend 403 is the backstop. If the context isn't yet resolved, the page resolves it (calls `getCommunity`) and redirects on `viewerIsAdmin === false`.

3. **`/[slug]/requests.vue` (NEW):** lists PENDING members (`GET /{slug}/members` → filter `status === 'PENDING'`). Each row: **Bestätigen** (`approveMember`) / **Ablehnen** (`removeMember`). Refreshes after each action; updates the pending badge.

4. **`/[slug]/members.vue` (rework):** active roster only (filter `status === 'ACTIVE'`). Per row: **Zu Admin** (`promoteMember`) / **Admin entziehen** (`demoteMember`) / **Entfernen** (`removeMember`). Last-admin errors (409) surface as a friendly message.

5. **`/[slug]/settings.vue` (rework):** edit `name` + `startsAt` + `phaseTwoStartRound`; an **invite block** that shows the current link (`getInvite`) with a **copy button** (VueUse `useClipboard`), expiry, **Neu generieren** (`generateInvite`), and **Widerrufen** (`revokeInvite`).

6. **API client (`src/api/communities.ts`):** add `getInvite(slug): InviteResponse | null` (`GET /{slug}/invite`) and `revokeInvite(slug)` (`DELETE /{slug}/invite`) if missing; extend the `CommunityResponse` type with `viewerIsAdmin: boolean` + `pendingCount: number`.

**Frontend tests** (Vitest + `vi`):
- shell renders the ⚙ menu only when `viewerIsAdmin`, and the badge reflects `pendingCount`; the name links to `/`.
- guard redirects a non-admin away from `requests`/`members`/`settings`.
- requests: approve + reject call the right API and refresh.
- members: promote/demote/remove; 409 last-admin message.
- settings: shows the existing invite link + copy + regenerate + revoke; meta-field edit.

## Out of scope / follow-ups

- Self-leave UI for non-admin members (deferred).
- Switcher polish (admin badges, pending counts across communities).
- Email/notifications on join/approval.
- The per-community countdown/game/points logic (separate spec) — `startsAt`/`phaseTwoStartRound` are editable here but have no runtime effect yet.

## Feed knowledge back

After implementation, capture into `.claude/guidelines/frontend.md`: the **per-community admin gating pattern** — the `/[slug]/` shell resolves `viewerIsAdmin` once and `provide`s the community context; admin sub-routes inject it for client-side gating, with the backend `requireAdmin` as the authoritative backstop (client gating is UX only).
