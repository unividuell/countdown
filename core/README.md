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

   **Two worktrees share one container.** `compose.yaml`'s `name: countdown` is fixed on purpose
   (see the comment above it), which also means two backends started from two different worktrees
   of this repo bring up the *same* Postgres container — Spring's docker-compose support skips
   bring-up when a matching one is already running, so the second session silently attaches to the
   first session's container. When that first session's `./mvnw spring-boot:run` stops and tears
   the stack down, the second session starts failing every request with `Connection refused`, for a
   reason nothing in that session's own logs explains. `docker compose -p countdown ps` shows
   whether Postgres is still there before you go looking for a bug in the app.
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
   The ranking row on a community home starts at all zeros and fills up as members play rounds —
   there is no stand-in for game points any more, in no environment.
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

## Guess Hue: checking the dataset

The production dataset doesn't live in the repo (see
[game-content.md](../.claude/guidelines/game-content.md)). Check it after changing the
gitignored buffer file — the buffer file lives in the main checkout, so a relative path
from a worktree won't reach it; hence the absolute path below. `./scripts/guess-hue-dataset.sh decrypt`
prints exactly that absolute path (also in its error message, if the buffer file already
exists):

```bash
./scripts/guess-hue-dataset.sh decrypt   # prints "Decrypted to: <path>"
cd core && ./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset=<path from the script output>
```

Without the property the test skips itself — that's what keeps CI green even though it
has no access to the plaintext. Locally, without a mounted dataset, the app runs on
`guess-hue-dataset.sample.yaml`; under `production` and `staging` it refuses to start instead.

### Using the real dataset locally

The six-entry sample is enough to start `guess-hue`, but not to judge the game. Anyone
working on it can load the real, 60-entry dataset locally before ever deploying:

```bash
./scripts/guess-hue-dataset.sh decrypt
export GUESS_HUE_DATASET_PATH=…   # the path the script prints
cd core && ./mvnw spring-boot:run
```

`.claude/launch.json`'s `backend` configuration does both steps for you, through
`./scripts/guess-hue-dataset.sh dev-path` — so a fresh worktree starts on the real dataset
without any setup. The age key stays the gate: `dev-path` prints an empty path on a machine that
cannot decrypt, and the backend then runs on the sample, because not everyone needs the key and
every extra plaintext copy on another machine is one more risk. Both entry points write the
plaintext to the main checkout's gitignored `.local/`, never into a worktree, and neither ever
overwrites a buffer file that is already there — that file is the one `encrypt` reads back, so it
may hold entries the cipher doesn't have yet.

This needs an age key (see [game-content.md](../.claude/guidelines/game-content.md)).
Without one, everything else keeps working — only this one convenience doesn't. The
decrypted file lands gitignored in the main checkout under `.local/guess-hue-dataset.yaml`
and is never committed.
