## Running locally

The default local setup needs **no GitHub OAuth App and no credentials** — it logs in
through a seeded test-user picker (see step 3). Set up a real OAuth App only to replay
the production login flow locally (see "Real GitHub login" below).

1. Start Postgres + the app:
   ```bash
   cd core && ./mvnw spring-boot:run
   ```
   Spring Boot's docker-compose support brings up `compose.yaml` from the repo root
   (Postgres 18 + pgAdmin). It finds it via `spring.docker.compose.file: ../compose.yaml`
   in `application.yaml`, because the file sits one level above this module.
2. Optionally grant yourself super-admin:
   ```bash
   export SUPER_ADMIN_GITHUB_LOGINS=your-github-login   # comma-separated logins granted ROLE_SUPER_ADMIN
   ```
   The variable is bound to the `app.super-admin-github-logins` property; under this exact
   name it is wired through `application.yaml`.
   Optionally give members invented-but-stable game points, so the ranking row on a community
   home shows a real order instead of all zeros:
   ```bash
   cd core && ./mvnw spring-boot:run -Dspring-boot.run.arguments="--app.stub-points.enabled=true"
   ```
   It is off by default and set nowhere but `application-staging.yaml` — deliberately, so no
   production config file has to mention stubbing at all. `.claude/launch.json`'s `backend`
   configuration passes it for you.
3. Log in at `http://localhost:8080/login/github` — a picker offers the seeded Futurama
   users (`Fry`, `leela`, `Bender`, `prof`, `amy`). Afterwards `GET /api/me` returns the
   provisioned user (or `401` when not logged in).

When developing against the `webapp-vue` SPA (the normal setup), start the SPA too and use
`http://localhost:5173` instead — Vite proxies `/api`, `/oauth2`, `/login` and `/logout` to
this backend. See `webapp-vue/README.md`.

### Real GitHub login

To exercise the production OAuth flow instead of the picker:

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/login/oauth2/code/github`
   - **When logging in through the SPA**, use the SPA origin instead:
     `http://localhost:5173/login/oauth2/code/github`. A GitHub OAuth App allows only one
     callback URL — pick the one matching the origin you log in from. The `:8080` callback
     is only for testing the backend standalone.
2. Point the app at your app and turn the picker off:
   ```bash
   export GITHUB_CLIENT_SECRET=...        # from your OAuth App
   cd core && ./mvnw spring-boot:run \
     -Dspring-boot.run.arguments="--spring.security.oauth2.client.registration.github.client-id=<your-client-id> --app.test-auth.enabled=false"
   ```
   With `app.test-auth.enabled=false` there is no seeding and no picker, and
   `/login/github` redirects into the real GitHub flow.
