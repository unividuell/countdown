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
  adding/removing a login grants/revokes on next sign-in). Ignore blank entries
  (the empty-string env default can bind a ghost element).
- The name "super-admin" is deliberately distinct from future **community-admins**
  — don't conflate them when adding finer-grained roles later.

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
  `github_id`s** (−1…−5) so they never collide with real (positive) GitHub ids.
- The picker POST carries the CSRF token as a hidden `_csrf` field (server embeds
  `csrfToken.token`); `POST /login/github/as` builds a `CountdownOAuth2User` principal and persists
  the session via `HttpSessionSecurityContextRepository().saveContext(...)` — indistinguishable from
  a real login.
- **Flip locally:** set `app.test-auth.enabled=false` to replay the exact prod GitHub flow on
  localhost (no seed, no picker). Real GitHub OAuth is otherwise exercised only in prod (staging
  logs in via the picker; no separate staging GitHub OAuth App).
- Tests: the test classpath also needs `app.test-auth.enabled` set; a test that counts users (e.g.
  provisioning) must set it `false` to avoid the seeder's rows.

## Secrets

Never commit credentials. Inject via env: `${GITHUB_CLIENT_ID}`,
`${GITHUB_CLIENT_SECRET}`, `${SUPER_ADMIN_GITHUB_LOGINS:}`.
