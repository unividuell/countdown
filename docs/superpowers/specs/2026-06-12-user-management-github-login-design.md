# User Management — GitHub Social Login

**Status:** Approved design (2026-06-12)
**Module:** `core` → Spring Modulith module `iam`

## Purpose

First feature of the `core` backend, which ports the existing
`huettehuette.unividuell.org` app (Nuxt + Firebase) to Spring Boot.
Authenticate users via GitHub social login (no local passwords), persist a
local user record keyed by our own UUID v7, expose the authenticated user to a
future SPA frontend over an HTTP session, and support a super-admin role.

## Source-app context

The existing app uses Firebase Auth (GitHub provider, popup login) and stores a
`userExtensions` Firestore document per user, keyed by the Firebase `uid`.
Relevant fields and behaviours ported here:

- `providedDisplayName` — GitHub display name (`name`), synced from the provider
  → our `github_name`.
- `givenDisplayName` — user-chosen name → our `display_name`.
- `bgColorHex` — user-editable profile colour → our `bg_color_hex`.
- App-admin via Firebase custom claim `admin: true` → our `is_super_admin` role
  (named *super-admin* to disambiguate from future community-admins).
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
| Module name | `iam` (Identity & Access Management). Avoids the reserved word `user`; also covers the super-admin role. |
| Schema per module | Each Spring Modulith module owns a dedicated Postgres schema. The `iam` module uses schema `iam`. |
| Module-based migrations | Spring Modulith's module-aware Flyway support: per-module migration folders with independent versioning. |
| Frontend topology | **Same-origin** behind a reverse proxy → `SameSite=Lax` cookies, no CORS, simple CSRF. |
| Email source | Only GitHub `/user`. Email may be **null** if the user keeps it private. |
| `email_verified` | **Dropped entirely** — not fetched, not stored (the source app doesn't use it either). |
| GitHub name | Sync **both** `github_login` (handle, stable/unique) and `github_name` (display name, nullable). |
| Displayed username | `display_name ?: github_name ?: github_login`. |
| User lifecycle | **Auto-provision on first login + sync on every login.** GitHub is the source of truth for `github_login`, `github_name`, `email`. |
| User-owned fields | `display_name` and `bg_color_hex` are set by the user and **never touched by sync**. |
| Super-admin role | `is_super_admin` flag → `ROLE_SUPER_ADMIN` (the app-admin; community-admins come later). Granted declaratively via a configurable allowlist of GitHub logins, re-evaluated on every login. |
| UUID v7 generation | **Postgres-side** via column `DEFAULT uuidv7()` (requires Postgres 18+). |
| Unauthenticated API call | Return **401 JSON** (no redirect). Frontend initiates login by navigating to `/oauth2/authorization/github`. |
| Login ↔ domain integration | **Custom `OAuth2UserService`** that upserts the user and returns a principal carrying our UUID + authorities (Approach A). |

## Architecture

### Module structure (Spring Modulith)

Package root `org.unividuell.countdown.core.iam`.

- **Exposed (module API):**
  - `User` — read view of the domain user (aggregate).
  - `UserQuery` — facade for other modules (e.g. `findById(UUID): User?`).
- **Internal (`iam.internal`):**
  - `UserRepository` — Spring Data JDBC repository.
  - `UserProvisioningService` — upsert / sync logic (incl. super-admin allowlist).
  - `UserProfileService` — self-service updates to user-owned fields.
  - `UserQueryService` — `UserQuery` implementation.
  - `GitHubOAuth2UserService` — custom `OAuth2UserService`.
  - `CountdownOAuth2User` — custom principal (carries UUID + authorities).
  - `SecurityConfig` — `SecurityFilterChain` (auth-centric, lives in this module).
  - `UserController` — `/api/me` (GET + PATCH).

A Modulith verification test (`ApplicationModules.verify()`) enforces that no
other module reaches into `iam.internal`.

### Persistence: schema + module-based Flyway migrations

Spring Modulith's module-aware Flyway support is enabled with
`spring.modulith.runtime.flyway-enabled=true`. With it, the configured base
location (`classpath:db/migration`, no wildcard) is expanded **per module**:
Flyway runs once for each application module plus a `__root` pseudo-module, each
with its **own schema-history table** so versioning is independent.

| Identifier | Location scanned | History table | Contents |
|---|---|---|---|
| `__root` | `classpath:db/migration/__root` | `flyway_schema_history` | shared/infra DDL (Spring Session) |
| `iam` | `classpath:db/migration/iam` | `flyway_schema_history_iam` | the `iam` schema + its tables |

Consequences:
- Migrations must live in the per-module subfolders; scripts placed directly in
  `db/migration` are **not** scanned.
- Each module's migrations start at `V1` independently (own history table).
- The `iam` migration creates and owns its schema; the `__root` migration owns
  shared infrastructure tables in the default (public) schema.
- Requires ArchUnit on the **runtime** classpath (provided transitively by
  `spring-modulith-starter-core`); the runtime support fails fast otherwise.

`db/migration/iam/V1__create_users.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS iam;

CREATE TABLE iam.users (
    id              UUID         PRIMARY KEY DEFAULT uuidv7(),
    github_id       BIGINT       NOT NULL UNIQUE,
    github_login    TEXT         NOT NULL,
    github_name     TEXT         NULL,
    display_name    TEXT         NULL,
    email           TEXT         NULL,
    bg_color_hex    TEXT         NULL,
    is_super_admin  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

`db/migration/__root/V1__spring_session.sql`: the official Spring Session JDBC
PostgreSQL schema (`SPRING_SESSION`, `SPRING_SESSION_ATTRIBUTES`) in the default
schema. Spring Session schema auto-initialization is disabled
(`spring.session.jdbc.initialize-schema=never`) so Flyway owns all DDL.

Data-model notes:
- `github_id` is the GitHub **numeric** id — the stable link key (the login can
  change), enforced `UNIQUE`.
- Synced from GitHub every login: `github_login`, `github_name`, `email`.
- User-owned, never overwritten by sync: `display_name`, `bg_color_hex`.
- `is_super_admin` is recomputed every login from the super-admin allowlist.

Kotlin entity (the schema is pinned on the entity; column names are mapped
automatically by Spring Data JDBC's `DefaultNamingStrategy`, which is
`snake_case`):

```kotlin
@Table(schema = "iam", name = "users")
data class User(
    @Id val id: UUID? = null,
    val githubId: Long,
    val githubLogin: String,
    val githubName: String?,
    val displayName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isSuperAdmin: Boolean = false,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
)
```

`id == null` ⇒ Spring Data JDBC treats the row as new (INSERT) and Postgres
fills the UUID v7 via the column default; it is read back after insert.

### OAuth2 / Security flow

1. Frontend navigates to `/oauth2/authorization/github`.
2. Standard Spring Security OAuth2 login redirects to GitHub (scope `read:user`).
3. On callback, `GitHubOAuth2UserService` (delegates to `DefaultOAuth2UserService`):
   - fetches GitHub attributes,
   - extracts `id` (→ `githubId`), `login` (→ `githubLogin`), `name`
     (→ `githubName`, nullable), `email` (nullable),
   - calls `UserProvisioningService.provision(...)`,
   - returns a `CountdownOAuth2User` whose `getName()` is our UUID string and
     whose authorities are `ROLE_USER` plus `ROLE_SUPER_ADMIN` when `is_super_admin`.
4. Spring Session JDBC persists the authenticated session in Postgres.

`SecurityFilterChain`:

- `permitAll`: `/oauth2/**`, `/login/**`, actuator health endpoint.
- `/api/super-admin/**` (and any future super-admin paths): `hasRole("SUPER_ADMIN")`.
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
  - **exists** → update `github_login`, `github_name`, `email`, `is_super_admin`
    (from allowlist), `updated_at` — never `display_name` / `bg_color_hex` —
    save, return.
  - **absent** → insert a new row (`is_super_admin` from allowlist).
- Super-admin allowlist: `app.super-admin-github-logins` (list of GitHub logins)
  configured via properties/env. `is_super_admin = login in allowlist`,
  re-evaluated each login, so adding/removing a login grants/revokes super-admin
  on next sign-in. This replaces the source app's magic-token bootstrap endpoint.
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
| `GET` | `/api/me` | required | `200` `{ id, username, githubLogin, githubName, email, bgColorHex, isSuperAdmin, createdAt }` where `username = display_name ?: github_name ?: github_login`; `401` if unauthenticated. |
| `PATCH` | `/api/me` | required | Body `{ displayName?, bgColorHex? }` (null clears). Updates the caller's own record. `200` with the updated user. |
| `GET` | `/oauth2/authorization/github` | public | Starts the GitHub OAuth flow (Spring Security). |
| `POST` | `/logout` | required | `204`, clears the session. |

## Configuration & secrets

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` injected via environment variables;
  `application.yaml` references them with `${...}`.
- `spring.modulith.runtime.flyway-enabled: true` — module-aware migrations.
- `spring.session.jdbc.initialize-schema: never` — Flyway owns session DDL.
- `app.super-admin-github-logins` — comma-separated GitHub logins granted super-admin.
- `compose.yaml`: pin Postgres to `18` (for `uuidv7()`).
- Datasource configured to match the compose Postgres service.

## Testing

- **Testcontainers Postgres** (already on the classpath): repository &
  provisioning tests against real Postgres + module-based Flyway migrations.
  Verifies the `iam` schema/table is created, INSERT on first login, field sync
  on repeat login, that `display_name` / `bg_color_hex` survive sync, and that
  `is_super_admin` follows the allowlist.
- **MockMvc** + `spring-security-test` (`oauth2Login()`): `/api/me` returns
  `200` when authenticated and `401` when not; `PATCH /api/me` updates own
  fields; `/api/super-admin/**` requires `ROLE_SUPER_ADMIN`; `/logout` clears the session.
- **Modulith** `ApplicationModules.verify()` to enforce module boundaries.

## Out of scope (YAGNI)

- `noncompetitive` flag and other game-domain user data (belongs to the game
  module, ported separately).
- Data migration from Firebase (fresh start, no existing data).
- Roles beyond `super-admin` (single boolean for now); community-admins come later.
- Additional OAuth providers, account linking.
