## Running locally

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/login/oauth2/code/github`
2. Export credentials and (optionally) super-admin logins:
   ```bash
   export GITHUB_CLIENT_ID=...        # from the OAuth App
   export GITHUB_CLIENT_SECRET=...
   export SUPER_ADMIN_GITHUB_LOGINS=your-github-login   # comma-separated GitHub logins granted ROLE_SUPER_ADMIN
   ```
   Note: `SUPER_ADMIN_GITHUB_LOGINS` is bound to the `app.super-admin-github-logins` property; if you set it via that exact env-var name it is wired through `application.yaml`.
3. Start Postgres + the app (Spring Boot docker-compose support starts `compose.yaml`, Postgres 18):
   ```bash
   ./mvnw spring-boot:run
   ```
4. Log in by visiting `http://localhost:8080/oauth2/authorization/github`.
   After the GitHub redirect, `GET /api/me` returns your provisioned user (or `401` if you are not logged in).
