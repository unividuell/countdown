# Security & Auth

Spring Security 7 + OAuth2 client + Spring Session JDBC. The `iam` module owns the
app-wide `SecurityFilterChain` today (acceptable while auth is the only security
concern; revisit when other modules gain protected resources).

## Login & identity

- **GitHub OAuth2 only**, no local passwords. Scope `read:user`.
- A custom `OAuth2UserService` (delegating to `DefaultOAuth2UserService`) extracts
  GitHub claims, **provisions/syncs** the local user on every login, and returns a
  custom principal (`OAuth2User`) carrying our domain user. `getName()` returns our
  UUID. Fail fast on missing claims with `OAuth2AuthenticationException` (routes
  through the OAuth error flow), not `ClassCastException`/NPE.
- Sessions persist in Postgres via **Spring Session JDBC**
  (`spring.session.jdbc.initialize-schema=never`; Flyway owns the schema, in
  `db/migration/__root/`). The principal and its domain user must be
  `Serializable` with a stable `serialVersionUID` (JDK serialization).
- `DefaultOAuth2UserService.loadUser` is `final` in Security 7 — **delegate**
  (constructor injection), don't subclass. When a `@Service` also implements the
  type it injects, give it a secondary `@Autowired` constructor that supplies a
  fresh delegate to avoid self-injection.

## SPA contract (same-origin)

- Unauthenticated API calls return **401** (not a redirect). The frontend triggers
  login by navigating to `/oauth2/authorization/github`. This is deliberate —
  set `exceptionHandling { authenticationEntryPoint = HttpStatusEntryPoint(UNAUTHORIZED) }`
  and document it so it isn't mistaken for a misconfiguration.
- The SPA's single "Login with GitHub" button navigates to **`/login/github`** (not the OAuth
  endpoint directly) so the *server* can choose GitHub vs the test picker. See "Test login".
- **CSRF** via `CookieCsrfTokenRepository.withHttpOnlyFalse()` +
  `CsrfTokenRequestAttributeHandler()` (plain handler so the cookie value matches
  the header — avoids the BREACH/XOR mismatch that breaks SPAs). The SPA must echo
  the `XSRF-TOKEN` cookie as the `X-XSRF-TOKEN` header on mutating requests
  (incl. `POST /logout`). The token cookie is only written once the deferred
  `CsrfToken` is *read*, which a plain `GET /api/me` never does — so register a
  `CsrfCookieFilter` (an `OncePerRequestFilter` that reads `csrfToken.token`)
  **after `CsrfFilter`** (`addFilterAfter<CsrfFilter>(CsrfCookieFilter())`) to
  materialise it on every request. Without it, the SPA has no cookie to echo and
  `POST /logout` returns **403**.
- Logout: `POST /logout` → **204** (`HttpStatusReturningLogoutSuccessHandler`).
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- **Disable the request cache** (`requestCache { requestCache = NullRequestCache() }`). On a 401 the `ExceptionTranslationFilter` caches the intercepted request *regardless* of the entry point; for a SPA the intercepted request is the bootstrap `GET /api/me`, and the OAuth2 success handler would replay it — landing the user on raw `/api/me` JSON instead of the app. With no request cache, login success goes to `/` and the SPA owns navigation.
- **Dev behind the Vite proxy:** the proxy must be transparent (`changeOrigin: false`) so the backend sees the browser's `Host` and builds OAuth2 `redirect_uri`/redirects on the SPA origin; the GitHub OAuth App callback is the SPA origin. See [frontend.md](frontend.md).

## Authorization rules

- Order matters: specific `permitAll` paths and role-gated paths **before**
  `anyRequest authenticated` (the catch-all).
- Keep actuator exposure narrow (`/actuator/health`, not `/actuator/**`).

## Roles

- The app-level admin is **super-admin**: `is_super_admin` → authority
  `ROLE_SUPER_ADMIN`; `/api/super-admin/**` requires `hasRole("SUPER_ADMIN")`.
- Granted declaratively via an allowlist of GitHub logins
  (`app.super-admin-github-logins`), **re-evaluated on every login** (so
  adding/removing a login grants/revokes on next sign-in). The empty-string env
  default (`${SUPER_ADMIN_GITHUB_LOGINS:}`) binds to `emptyList()`, not a
  one-element list — nobody holds the role.
- **Compare/key against `SuperAdminProperties.normalizedSuperAdminGithubLogins`**
  (trimmed, blanks dropped) — never re-derive that filtering per consumer. A
  duplicated `filter { it.isNotBlank() }` with no `.trim()` in both `isSuperAdmin`
  and `SuperAdminRosterService` let `"alice, bob"` (space after the comma)
  silently deny `bob` the role while leaking a phantom `" bob"` row from the
  roster endpoint — same bug, two call sites, because the normalisation wasn't
  centralised.
- The name "super-admin" is deliberately distinct from future **community-admins**
  — don't conflate them when adding finer-grained roles later.
- **`/api/super-admin/**` is gated once, centrally.** Controllers under that path carry **no**
  authorization check and no `AuthenticatedUser` parameter — the `SecurityConfig` rule already
  guarantees the caller. Each module contributes its own controller for its own data
  (`community.internal.SuperAdminController` for communities; in `iam`,
  `SuperAdminRosterController` serves the *roster* of super-admins and
  `SuperAdminUserController` the *user administration* — list, detail, and the
  community-creation clearance); there is no aggregating `superadmin` module, because that would
  force "give me everything" ports into the shared module API for the benefit of one UI.
- **The flag and the allowlist drift on purpose.** `is_super_admin` is re-derived on every login,
  so a newly allowlisted person has no flag until they sign in and a removed one keeps it until
  their next sign-in. Anything reporting on super-admins must read both sources and say which
  one a row came from — `GET /api/super-admin/super-admins` is the reference. Match the two
  **case-insensitively** (lowercased login), because that is how `SuperAdminProperties` grants
  the role; a case-sensitive join reports one person twice.
- **Never write the glob form of that path inside a KDoc.** Kotlin block comments *nest*, unlike
  Java's. The slash before a `**` glob opens a second, nested comment, so the doc comment's real
  `*/` closes only the inner one — the compiler swallows the rest of the file and reports
  `Unclosed comment`, pointing nowhere near the actual text. Write "the `/api/super-admin` tree"
  in prose instead. This bit a controller KDoc that quoted the security rule verbatim.

## Per-user permissions — read them live from the row, never from the principal

Finer-grained permissions than the super-admin role live in a column on `iam.users` and are
**read live on every request**. The first one is `community_creation_allowed`, gating
`POST /api/communities`.

- **`AuthenticatedUser` is deliberately not extended with them.** `CountdownOAuth2User` (and the
  `User` it carries) is **JDK-serialized into the Spring Session JDBC table at login and never
  refreshed** — a clearance granted after sign-in would stay invisible in the principal until the
  next login. So a permission read from `me` would silently be a permission read from a snapshot.
  Adding the field to the principal is the tempting shortcut; it is the bug.
- **Cross-module reads go through a port on the `iam` public API**, not through the principal and
  not by reaching into `iam.internal`: `UserQuery.mayCreateCommunities(id)` loads the row and
  returns `false` for an unknown id. `CommunityController.create` calls exactly that and throws
  `CommunityCreationNotAllowedException` (→ 403) — it must **not** re-combine `me.isSuperAdmin`,
  because the port already folds it in (see the two-names rule below).
- **Two names, two facts — don't conflate them.** `User.communityCreationAllowed` is the *raw
  column*; `User.mayCreateCommunities` is the *computed effective permission*
  (`isSuperAdmin || communityCreationAllowed`) and the only place that rule lives. Super-admin DTOs
  (`SuperAdminUserListEntry`, `SuperAdminUserDetail`) carry the **raw** value, so an admin toggle
  shows what is actually stored; `GET /api/me` carries the **effective** one, because that is what
  the SPA gates its UI on. A super-admin therefore shows `communityCreationAllowed: false` and
  `mayCreateCommunities: true` at the same time, and that is correct.
- **`is_super_admin` is the deliberate exception.** It is re-derived from the allowlist on *every*
  login, so keeping it on the principal is safe and its staleness window (until the next sign-in)
  is by design — see the drift note above. Do not generalise that exception to permissions nobody
  re-derives at login.

## Test login (non-prod only — Firebase-emulator pattern)

To exercise multi-user flows without real GitHub accounts, non-prod envs offer a **test login**.
One SPA button → `/login/github`; the **server** decides by profile + a config flag:

- `app.test-auth.enabled` (default `true` in `application.yaml`; `false` in
  `application-production.yaml`; `true` in `application-staging.yaml`).
- **Gating is doubled:** the picker controller (`/login/github` → inline-HTML test-user picker),
  the `POST /login/github/as` login action, and the `TestUserSeeder` are **all**
  `@Profile("!production")` **and** `@ConditionalOnProperty("app.test-auth.enabled")` → in prod they
  are not wired at all. When the flag is off, a `GitHubLoginRedirectController`
  (`@ConditionalOnProperty("app.test-auth.enabled", havingValue="false", matchIfMissing=true)`) maps
  `/login/github` → `/oauth2/authorization/github`. Exactly one controller owns `/login/github`.
- **`@ConditionalOnProperty` gotcha (Spring Boot 4):** use the full key as the value
  (`@ConditionalOnProperty("app.test-auth.enabled")`), NOT `prefix=…, name=…` with a hyphenated
  prefix — relaxed binding doesn't apply to the hyphenated prefix segment and the condition silently
  never matches.
- **Seeder** is an `ApplicationRunner` (idempotent), **not** Flyway — migrations can't be
  profile/flag-gated and would leak test data into prod. Test users get **synthetic negative
  `github_id`s**, one per seed row counting down from −1 (−1, −2, −3, …), so they never collide
  with real (positive) GitHub ids; an id, once assigned to a row, is never reassigned. It also
  re-applies both the identity fields (`githubLogin`, `githubName`, `displayName`) and the
  super-admin allowlist on every run — insert **and** update — so a picker login grants
  `ROLE_SUPER_ADMIN` the same way a real login would, and a row can never drift out of reach of
  its own picker button; the update half matters because the seeder used to only insert, so a
  stale value could never converge.
- The picker POST carries the CSRF token as a hidden `_csrf` field (server embeds
  `csrfToken.token`); `POST /login/github/as` builds a `CountdownOAuth2User` principal and persists
  the session via `HttpSessionSecurityContextRepository().saveContext(...)` — indistinguishable from
  a real login.
- **`loginAs` only accepts seed logins** (`TestUserSeeder.seedLogins`, also the picker's source
  list) — it is `permitAll`, so resolving any stored `github_login` would let anyone assume any
  registered identity, including a super-admin one now that seed users can hold the flag.
- **Flip locally:** set `app.test-auth.enabled=false` to replay the exact prod GitHub flow on
  localhost (no seed, no picker). Real GitHub OAuth is otherwise exercised only in prod (staging
  logs in via the picker; no separate staging GitHub OAuth App).
- Tests: the test classpath also needs `app.test-auth.enabled` set; a test that counts users (e.g.
  provisioning) must set it `false` to avoid the seeder's rows.
- **The picker is server-rendered HTML, not SPA — it still needs mobile-first.** It shipped once
  without a `<meta name="viewport">` tag and rendered unreadably tiny on a phone: with no viewport
  tag, mobile browsers lay the page out at their ~980px desktop fallback width and then scale the
  whole thing down to fit, which looks like a CSS/sizing bug but isn't one. [frontend.md](frontend.md)'s
  mobile-first guidance is written for `webapp-vue`, but the expectation itself — and this specific
  gotcha — applies to any HTML the backend renders directly. If a server-rendered page looks tiny on
  a phone, check for the viewport meta tag before touching CSS.

## Secrets

Never commit credentials. Inject via env: `${GITHUB_CLIENT_ID}`,
`${GITHUB_CLIENT_SECRET}`, `${SUPER_ADMIN_GITHUB_LOGINS:}`.
