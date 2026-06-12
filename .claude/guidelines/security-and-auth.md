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
- **CSRF** via `CookieCsrfTokenRepository.withHttpOnlyFalse()` +
  `CsrfTokenRequestAttributeHandler()` (plain handler so the cookie value matches
  the header — avoids the BREACH/XOR mismatch that breaks SPAs). The SPA must echo
  the `XSRF-TOKEN` cookie as the `X-XSRF-TOKEN` header on mutating requests
  (incl. `POST /logout`). Note: the token cookie is only emitted once the
  `CsrfToken` is resolved — ensure an early endpoint materialises it.
- Logout: `POST /logout` → **204** (`HttpStatusReturningLogoutSuccessHandler`).
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production.

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

## Secrets

Never commit credentials. Inject via env: `${GITHUB_CLIENT_ID}`,
`${GITHUB_CLIENT_SECRET}`, `${SUPER_ADMIN_GITHUB_LOGINS:}`.
