# Security & Auth

Sign-in, the SPA contract and the test login come from the auth lib
**`org.unividuell:auth-spring-boot-starter`** — its
[README](https://github.com/unividuell/auth-spring-boot-starter#readme) is the contract
(endpoints, configuration, start-up refusals, its own rules). This file keeps what is countdown's.
Design: [the auth-lib spec](../../docs/superpowers/specs/2026-10-03-auth-lib-design.md). The lib
ships through the committed file repository `core/maven-repo/` — see
[dependency-updates.md](dependency-updates.md).

## Accounts

- **One row per `(provider, subject)`** in `iam.users`, never linked — not even by e-mail: GitHub's
  `/user` e-mail is an unverified profile field, so linking on it hands accounts over.
  `github_login`/`github_name` keep their names until a second real provider arrives.
- `UserProvisioningService` is the lib's one hook (`AccountProvisioner`): a single
  `INSERT … ON CONFLICT (provider, subject) DO UPDATE … RETURNING id`. It writes the provider's
  fields and `is_super_admin`, never `display_name`, `bg_color_hex` or `community_creation_allowed`.
- Controllers take `@AuthenticationPrincipal me: AuthenticatedUser` — a typealias for the lib's
  `AuthPrincipal` (`me.id`, `me.provider`, `me.login`, `me.roles`). `me.isSuperAdmin` is an
  extension in `iam`; import it.
- Sessions live in Postgres via **Spring Session JDBC**; Flyway owns the schema in
  `db/migration/__root/` (`spring.session.jdbc.initialize-schema=never`). The principal is
  JDK-serialized there, so a principal class that changes incompatibly ships with a `__root`
  migration that empties `spring_session` (`V2` is the precedent) — or every old session answers
  500 instead of 401.

## No session for an anonymous request

Never inject `HttpSession` or call `getSession()`/`getSession(true)` in code that runs for an
anonymous request — a filter, an interceptor, a `@ModelAttribute`, a public endpoint. With Spring
Session JDBC each session is a row: a sibling app grew ~88k empty sessions from one cookie-less
healthcheck. The lib's own pages create no session; starting a provider sign-in does (it keeps
the authorization request). countdown's code is countdown's job.

## SPA contract — countdown's side

- `unividuell.auth.frontend: spa` — required since the lib's 0.3.0, which refuses to start without
  it. The test classpath's `application.yaml` repeats it, since it replaces the main file.
- The SPA's one sign-in button navigates to **`/login/start`**; the lab's „Spieler wechseln“ adds
  `?redirect=<path>`. The bare `/login` is the SPA's sign-in page — the lib maps nothing there, and
  edge and dev proxy forward only the paths below it ([deployment-edge.md](deployment-edge.md),
  [frontend.md](frontend.md)).
- `unividuell.auth.csrf-cookie.excluded-paths: /api/preview/**` — the link-preview endpoint answers
  crawlers publicly cacheable, and a `Set-Cookie` there defeats every shared cache. The test
  classpath's `application.yaml` repeats it, since it replaces the main file.
- **Dev behind the Vite proxy:** transparent (`changeOrigin: false`), so OAuth2 `redirect_uri` and
  redirects land on the SPA origin. See [frontend.md](frontend.md).

## Authorization rules

- `SecurityConfig` holds countdown's rules only; the lib's (`/login/**`, `/oauth2/**`, error
  dispatches) run first. Order matters: specific `permitAll` and role-gated paths **before**
  `anyRequest authenticated`.
- Keep actuator exposure narrow (`/actuator/health`, not `/actuator/**`).

## Tests

- MockMvc tests sign in with `principalFor(…)` (`TestPrincipals.kt`) and send the CSRF token with
  the lib's `withCsrfToken()` (`auth-spring-boot-starter-test`): the `XSRF-TOKEN` cookie echoed in
  the header, as the SPA does. **Never spring-security-test's `csrf()`**: it replaces the shared
  CsrfFilter's cookie repository with a session-backed one for good, so later tests in the same
  context get no `XSRF-TOKEN` cookie and create sessions, depending on which ran first.

## Rate-limited endpoints reachable without a session

`GET /api/communities/join/*` (invite name lookup) and `GET /api/preview/**` (link previews) are
`permitAll` — no session needed. Both sit behind `PublicRateLimitFilter` (`iam`, in-memory,
per-client-IP, 20/minute, `429` above it). **GET only**: the matching `POST` (accepting an invite)
already requires a session, so it is simply not counted here — there is no second budget.

- **The `X-Forwarded-For` trap.** Caddy *appends* to that header rather than replacing it, and
  Spring's `ForwardedHeaderFilter` (`forward-headers-strategy=framework`) reads its **first**
  entry — a value the client can set itself. That makes raw XFF unusable for anything that treats
  a client address as an *identity* (rate limits, bans): an attacker resets the counter by sending
  a fresh `X-Forwarded-For: 1.2.3.4` on every request. `countdown-web` sets `X-Client-IP` from
  Caddy's own `{client_ip}` (`header_up` overwrites anything the client sent under that name) —
  that header, not XFF, is the one a filter may trust as identity.
- **The invite code's six characters are part of the security calculation, not a UI nicety.**
  Six-character Crockford Base32 is 32⁶ ≈ 1.07 billion combinations; the rate limit is what turns
  that into years of brute force instead of days. The name lookup answers a hit with the community
  name, so an unbraked version of either endpoint makes the code space walkable.

## Roles

- The app-level admin is **super-admin**: role `SUPER_ADMIN` → authority `ROLE_SUPER_ADMIN`;
  `/api/super-admin/**` requires `hasRole("SUPER_ADMIN")`.
- Granted by configuration: `unividuell.auth.roles.super-admin` (env **`SUPER_ADMINS`**),
  comma-separated `provider:login` — `github:<login>` in production, `test:<login>` on staging and
  locally. An entry without its prefix refuses to start; empty means nobody. The lib re-evaluates
  the list at every sign-in and hands the result to the provisioner, which stores `is_super_admin`.
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
- **The flag and the allowlist drift on purpose.** `is_super_admin` is re-derived at every sign-in,
  so a newly listed person has no flag until they sign in and a removed one keeps it until their
  next. Anything reporting on super-admins reads both sources and says which one a row came from —
  `GET /api/super-admin/super-admins` is the reference, reading the list through
  `RoleAllowlist.members("SUPER_ADMIN")`. Key rows by **provider plus lowercased login**:
  `github:prof` and `test:prof` are two people, and the lib matches logins case-insensitively.
- **Never write the glob form of that path inside a KDoc.** Kotlin block comments *nest*, unlike
  Java's: the slash before a `**` glob opens a second comment, so the doc comment's real `*/` closes
  only the inner one and the compiler swallows the rest of the file, reporting `Unclosed comment`
  nowhere near the actual text. Write "the `/api/super-admin` tree" in prose instead.

## Per-user permissions — read them live from the row, never from the principal

Finer-grained permissions than the super-admin role live in a column on `iam.users` and are
**read live on every request**. The first one is `community_creation_allowed`, gating
`POST /api/communities`.

- **The principal is deliberately not extended with them.** `AuthPrincipal` is **JDK-serialized
  into the Spring Session JDBC table at sign-in and never refreshed** — a clearance granted after
  sign-in would stay invisible in it until the next login. So a permission read from `me` would
  silently be a permission read from a snapshot. Only roles from configuration belong in it.
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
- **`SUPER_ADMIN` is the deliberate exception.** It comes from configuration and is re-evaluated at
  *every* sign-in, so carrying it in the principal is safe and its staleness window (until the next
  sign-in) is by design — see the drift note above. Do not generalise that exception to
  permissions nobody re-derives at sign-in.

## Test login (the lib's; never in production)

- localhost: the picker, unlocked. staging: locked by `FAKE_SIGN_IN_KEY`
  (→ `unividuell.auth.test-login.key`, no default there). production: the beans do not exist.
  `unividuell.auth.test-login.enabled=false` replays the real GitHub flow locally
  (`core/README.md`, "Real GitHub login").
- Test users are provider `test`, subject = login, provisioned on their first pick through the same
  `UserProvisioningService` as a real sign-in — no seeder, no synthetic ids.
- **Staging has no OAuth client.** The lib refuses a test-login key next to one:
  `/oauth2/authorization/github` would be a door past the lock. Never give staging a client.
- **Server-rendered HTML needs `<meta name="viewport">`** — without it phones lay the page out at
  ~980px and scale it down, which reads as a CSS bug and is not one. The lib's pages carry it; so
  must any HTML countdown renders itself (mobile-first: [frontend-ui.md](frontend-ui.md)).

## Secrets

Never commit credentials. Inject via env: `${GITHUB_CLIENT_SECRET}` (production only — the GitHub
App's client ID is public and committed in `application-production.yaml`), `${SUPER_ADMINS:}`,
`${FAKE_SIGN_IN_KEY}`.

- **A third-party API key restricted by HTTP referrer cannot make server-to-server
  calls** — the request carries no `Referer`, so the provider rejects it outright, no crash,
  just a silent 403 the caller has to notice. A browser key and a server key are two
  different credentials, restricted differently, even when they call the same API: one
  HTTP-referrer-restricted for the client, one IP-restricted for the backend, never the
  same value twice. See `SpotObjectProperties`/`GoogleCountryLookup` (the two Maps keys).
