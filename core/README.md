## Running locally

The default local setup needs **no GitHub OAuth App and no credentials** — it logs in
through a seeded test-user picker (see step 3). Set up a real OAuth App only to replay
the production login flow locally (see "Real GitHub login" below).

1. Start Postgres + the app, granting a seeded user super-admin in the same command:
   ```bash
   cd core && SUPER_ADMIN_GITHUB_LOGINS=Bender ./mvnw spring-boot:run
   ```
   Spring Boot's docker-compose support brings up `compose.yaml` from the repo root
   (Postgres 18 + pgAdmin). It finds it via `spring.docker.compose.file: ../compose.yaml`
   in `application.yaml`, because the file sits one level above this module.

   The variable has to be on the start command, not exported afterwards:
   `app.super-admin-github-logins` is bound when the context starts, so a running app never
   picks it up. Its value is a comma-separated list of logins granted `ROLE_SUPER_ADMIN`.
2. Why that login is **not optional**: without it you cannot create a Spielgemeinschaft at
   all. The variable is wired through `application.yaml` under that exact name, where it
   defaults to **empty** — so with nothing set, nobody holds the role.
   Creating a community requires the `community_creation_allowed` clearance or super-admin,
   no seeded user carries the clearance, and the only way to grant it is the super-admin area
   (`/super-admin/users`) — which needs a super-admin. So without this step every
   `POST /api/communities` answers `403`.
   With the test-login picker on (the default), the value must be one of the **seeded** logins
   from step 3, not your own GitHub login: only those rows exist, and only they can be picked.
   Matching is case-insensitive, so `bender` works as well as `Bender`.
   `.claude/launch.json`'s `backend` configuration already sets `SUPER_ADMIN_GITHUB_LOGINS=bender`,
   so starting from there needs none of this.
   Optionally give members invented-but-stable game points, so the ranking row on a community
   home shows a real order instead of all zeros — same command, one more flag:
   ```bash
   cd core && SUPER_ADMIN_GITHUB_LOGINS=Bender ./mvnw spring-boot:run \
     -Dspring-boot.run.arguments="--app.stub-points.enabled=true"
   ```
   It is off by default and set nowhere but `application-staging.yaml` — deliberately, so no
   production config file has to mention stubbing at all. `.claude/launch.json`'s `backend`
   configuration passes it for you.
3. Log in at `http://localhost:8080/login/github` — a picker offers the seeded Futurama
   users (`Fry`, `leela`, `Bender`, `prof`, `amy`, `hermes`, `zoidberg`, `scruffy`, `zapp`,
   `kif`, `nibbler`, `mom`). Afterwards `GET /api/me` returns the
   provisioned user (or `401` when not logged in). Pick the login from step 2 to get the
   super-admin, then clear any other seeded user for community creation under
   `/super-admin/users` — the clearance is read live, so it takes effect without a re-login.

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

## Guess Hue: das Datenset prüfen

Das Produktionsdatenset liegt nicht im Repo (siehe
[game-content.md](../.claude/guidelines/game-content.md)). Nach einer Änderung an der
gitignorierten Pufferdatei prüfen — die Pufferdatei liegt im Haupt-Checkout, ein relativer
Pfad aus einem Worktree trifft sie nicht, deshalb absolut:

```bash
./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset=/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml
```

Ohne die Property überspringt sich der Test — so bleibt die CI grün, die den Klartext nicht hat.
Lokal ohne gemountetes Datenset läuft die Anwendung auf `guess-hue-dataset.sample.yaml`; unter
`production` und `staging` bricht sie damit ab.
