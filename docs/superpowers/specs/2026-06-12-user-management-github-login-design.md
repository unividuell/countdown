# User Management — GitHub Social Login

**Status:** Approved design (2026-06-12)
**Module:** `core` → Spring Modulith module `user`

## Purpose

First feature of the `core` backend, which ports the existing
`huettehuette.unividuell.org` app (Nuxt + Firebase) to Spring Boot.
Authenticate users via GitHub social login (no local passwords), persist a
local user record keyed by our own UUID v7, expose the authenticated user to a
future SPA frontend over an HTTP session, and support an admin role.

## Source-app context

The existing app uses Firebase Auth (GitHub provider, popup login) and stores a
`userExtensions` Firestore document per user, keyed by the Firebase `uid`.
Relevant fields and behaviours ported here:

- `providedDisplayName` — GitHub display name (`name`), synced from the provider
  → our `github_name`.
- `givenDisplayName` — user-chosen name → our `display_name`.
- `bgColorHex` — user-editable profile colour → our `bg_color_hex`.
- Admin via Firebase custom claim `admin: true` → our `is_admin` role.
- `useUserSync` upserts the user on login → our provisioning + sync.

Deliberately **not** ported: `noncompetitive` (a game-domain ranking flag, not
user identity) and any data migration — the new project starts fresh with **no
existing data**, so no Firebase-uid → GitHub → UUID mapping is needed.

## Requirements

1. Social login **via GitHub only** — no local password.
2. Expose the authenticated user to a future frontend via **HTTP session**.
3. Take from the GitHub profile: **username, email**, plus whatever is
   technically required (GitHub id, etc.).
4. Our own primary id is a **UUID v7** (time-ordered, index-friendly).

## Decisions

| Topic | Decision |
|---|---|
| Frontend topology | **Same-origin** behind a reverse proxy → `SameSite=Lax` cookies, no CORS, simple CSRF. |
| Email source | Only GitHub `/user`. Email may be **null** if the user keeps it private. |
| `email_verified` | **Dropped entirely** — not fetched, not stored (the source app doesn't use it either). |
| GitHub name | Sync **both** `github_login` (handle, stable/unique) and `github_name` (display name, nullable). |
| Displayed username | `display_name ?: github_name ?: github_login`. |
| User lifecycle | **Auto-provision on first login + sync on every login.** GitHub is the source of truth for `github_login`, `github_name`, `email`. |
| User-owned fields | `display_name` and `bg_color_hex` are set by the user and **never touched by sync**. |
| Admin role | `is_admin` flag → `ROLE_ADMIN`. Granted declaratively via a configurable allowlist of GitHub logins, re-evaluated on every login. |
| UUID v7 generation | **Postgres-side** via column `DEFAULT uuidv7()` (requires Postgres 18+). |
| Unauthenticated API call | Return **401 JSON** (no redirect). Frontend initiates login by navigating to `/oauth2/authorization/github`. |
| Login ↔ domain integration | **Custom `OAuth2UserService`** that upserts the user and returns a principal carrying our UUID + authorities (Approach A). |

## Architecture

### Module structure (Spring Modulith)

Package root `org.unividuell.countdown.core.user`.

- **Exposed (module API):**
  - `User` — read view of the domain user.
  - `UserQuery` — facade for other modules (e.g. `findById(UUID): User?`).
- **Internal (package-private):**
  - `UserRepository` — Spring Data JDBC repository.
  - `UserProvisioningService` — upsert / sync logic (incl. admin allowlist).
  - `UserProfileService` — self-service updates to user-owned fields.
  - `GitHubOAuth2UserService` — custom `OAuth2UserService`.
  - `CountdownOAuth2User` — custom principal (carries UUID + authorities).
  - `SecurityConfig` — `SecurityFilterChain` (auth-centric, lives in this module).
  - `UserController` — `/api/me` (GET + PATCH).

A Modulith verification test (`ApplicationModules.verify()`) enforces that no
other module reaches into these internals.

### Data model

Flyway migration `V1__create_users.sql`:

```sql
CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    github_id     BIGINT       NOT NULL UNIQUE,
    github_login  TEXT         NOT NULL,
    github_name   TEXT         NULL,
    display_name  TEXT         NULL,
    email         TEXT         NULL,
    bg_color_hex  TEXT         NULL,
    is_admin      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

- `github_id` is the GitHub **numeric** id — the stable link key (the login can
  change), enforced `UNIQUE`.
- Synced from GitHub every login: `github_login`, `github_name`, `email`.
- User-owned, never overwritten by sync: `display_name`, `bg_color_hex`.
- `is_admin` is recomputed every login from the admin allowlist.

Kotlin entity:

```kotlin
@Table("users")
data class User(
    @Id val id: UUID? = null,
    val githubId: Long,
    val githubLogin: String,
    val githubName: String?,
    val displayName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isAdmin: Boolean = false,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
)
```

`id == null` ⇒ Spring Data JDBC treats the row as new (INSERT) and Postgres
fills the UUID v7 via the column default; it is read back after insert.

Flyway migration `V2__spring_session.sql`: the official Spring Session JDBC
PostgreSQL schema (`SPRING_SESSION`, `SPRING_SESSION_ATTRIBUTES`). Spring Session
schema auto-initialization is disabled (`spring.session.jdbc.initialize-schema=never`)
so Flyway owns all DDL.

### OAuth2 / Security flow

1. Frontend navigates to `/oauth2/authorization/github`.
2. Standard Spring Security OAuth2 login redirects to GitHub (scope `read:user`).
3. On callback, `GitHubOAuth2UserService` (extends `DefaultOAuth2UserService`):
   - calls `super.loadUser()` to fetch GitHub attributes,
   - extracts `id` (→ `githubId`), `login` (→ `githubLogin`), `name`
     (→ `githubName`, nullable), `email` (nullable),
   - calls `UserProvisioningService.provision(...)`,
   - returns a `CountdownOAuth2User` whose `getName()` is our UUID string and
     whose authorities are `ROLE_USER` plus `ROLE_ADMIN` when `is_admin`.
4. Spring Session JDBC persists the authenticated session in Postgres.

`SecurityFilterChain`:

- `permitAll`: `/oauth2/**`, `/login/**`, actuator health endpoint.
- `/api/admin/**` (and any future admin paths): `hasRole("ADMIN")`.
- everything else: `authenticated`.
- `oauth2Login { userInfoEndpoint { userService = gitHubOAuth2UserService } }`.
- `exceptionHandling { authenticationEntryPoint = HttpStatusEntryPoint(UNAUTHORIZED) }`
  → 401 instead of redirect for unauthenticated API calls.
- CSRF enabled with `CookieCsrfTokenRepository.withHttpOnlyFalse()` so the SPA
  can read the `XSRF-TOKEN` cookie and echo it back.
- Logout: `POST /logout` → invalidate session → `204`.

### Provisioning logic

`UserProvisioningService.provision(githubId, login, name, email): User`:

- `findByGithubId(githubId)`:
  - **exists** → update `github_login`, `github_name`, `email`, `is_admin`
    (from allowlist), `updated_at` — never `display_name` / `bg_color_hex` —
    save, return.
  - **absent** → insert a new row (`is_admin` from allowlist).
- Admin allowlist: `app.admin-github-logins` (list of GitHub logins) configured
  via properties/env. `is_admin = login in allowlist`, re-evaluated each login,
  so adding/removing a login grants/revokes admin on next sign-in. This replaces
  the source app's magic-token bootstrap endpoint.
- Concurrency: the `UNIQUE(github_id)` constraint guards against duplicate
  inserts from racing logins; on `DuplicateKeyException` retry once by
  re-fetching.

### Profile updates

`UserProfileService.update(userId, displayName?, bgColorHex?)` — only the
authenticated user's own record. Sets `display_name` and/or `bg_color_hex`
(null clears the value), bumps `updated_at`, returns the updated `User`.

### Session

Spring Session JDBC stores sessions in Postgres → they survive restarts and
support horizontal scaling. Cookie `SESSION`: `HttpOnly`, `SameSite=Lax`,
`Secure` in production.

## API contract

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/api/me` | required | `200` `{ id, username, githubLogin, githubName, email, bgColorHex, isAdmin, createdAt }` where `username = display_name ?: github_name ?: github_login`; `401` if unauthenticated. |
| `PATCH` | `/api/me` | required | Body `{ displayName?, bgColorHex? }` (null clears). Updates the caller's own record. `200` with the updated user. |
| `GET` | `/oauth2/authorization/github` | public | Starts the GitHub OAuth flow (Spring Security). |
| `POST` | `/logout` | required | `204`, clears the session. |

## Configuration & secrets

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` injected via environment variables;
  `application.yaml` references them with `${...}`.
- `app.admin-github-logins` — comma-separated GitHub logins granted admin.
- `compose.yaml`: pin Postgres to `18` (for `uuidv7()`).
- Datasource configured to match the compose Postgres service.

## Testing

- **Testcontainers Postgres** (already on the classpath): repository &
  provisioning tests against real Postgres + Flyway migrations. Verifies INSERT
  on first login, field sync on repeat login, that `display_name` /
  `bg_color_hex` survive sync, and that `is_admin` follows the allowlist.
- **MockMvc** + `spring-security-test` (`oauth2Login()`): `/api/me` returns
  `200` when authenticated and `401` when not; `PATCH /api/me` updates own
  fields; `/api/admin/**` requires `ROLE_ADMIN`; `/logout` clears the session.
- **Modulith** `ApplicationModules.verify()` to enforce module boundaries.

## Out of scope (YAGNI)

- `noncompetitive` flag and other game-domain user data (belongs to the game
  module, ported separately).
- Data migration from Firebase (fresh start, no existing data).
- Roles beyond `admin` (single boolean for now).
- Additional OAuth providers, account linking.
