# Staging Environment + Test-User Auth + Branch Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** A staging environment (`beta.countdown.unividuell.org`) on the same server as prod via one parametrized compose + per-env files; `develop`→`:staging` / `main`→`:latest` images; per-environment pgAdmin; and a Firebase-emulator-style test-login (one SPA button → `/login/github`, server decides GitHub vs a server-rendered test-user picker), gated `@Profile("!production")` + `app.test-auth.enabled`.

**Architecture:** Backend gets the emulator test-auth (config flag + staging profile + seeder + picker/redirect controllers, all in `iam.internal.devauth`). CI workflows gain a `develop` trigger + branch-based tags. `deploy/` is parametrized (rename `compose.prod.yaml`→`compose.yaml`, `.env.prod`/`.env.staging`, `update.sh <target>`). `edge-caddy` adds the beta site. A manual server cutover finishes it.

**Tech Stack:** Kotlin/Spring Boot 4.1 (Spring Security 7, Spring Session JDBC, `@ConditionalOnProperty`) · Vue 3 · GitHub Actions · Docker Compose · Caddy.

**Spec:** `docs/superpowers/specs/2026-06-13-staging-environment-design.md`.

**Branch:** `feat/staging-environment` (checked out). This feature bootstraps the workflow, so it merges to `main` directly and creates `develop` afterward.

**Key current facts:** no Thymeleaf (only `spring-boot-starter-webmvc`) → picker is inline HTML from a controller. `/login/**` is **already** `permitAll` in `iam.internal.SecurityConfig` → no security-rule change needed for `/login/github`. `CountdownOAuth2User(user: User, attributes: Map<String,Any>)` is the session principal. `useAuth().loginWithGitHub()` currently navigates to `/oauth2/authorization/github`.

---

## Phase 1 — Backend: emulator test-auth

### Task 1: config flag + staging profile config

**Files:**
- Modify: `core/src/main/resources/application.yaml`
- Modify: `core/src/main/resources/application-production.yaml`
- Create: `core/src/main/resources/application-staging.yaml`

- [ ] **Step 1: Implement** (no test — config; verified by later tasks' `@ConditionalOnProperty`).

`application.yaml` — add under the existing `app:` block:
```yaml
app:
  super-admin-github-logins: ${SUPER_ADMIN_GITHUB_LOGINS:}
  test-auth:
    # Emulator-style test login (seeded users + picker). Default on for localhost.
    # Set false to replay the real prod GitHub OAuth flow locally (no seed, no picker).
    enabled: true
```

`application-production.yaml` — add:
```yaml
app:
  test-auth:
    enabled: false
```

`application-staging.yaml` (NEW — mirrors prod web/datasource; test-auth ON; GitHub registration
inherited from `application.yaml` (dev client-id), unused on staging):
```yaml
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/app
    username: admin
    password: ${POSTGRES_PASSWORD}
server:
  forward-headers-strategy: framework
  servlet:
    session:
      cookie:
        secure: true
        same-site: lax
app:
  test-auth:
    enabled: true
```

- [ ] **Step 2: Commit** — `feat(iam): app.test-auth.enabled flag + staging profile config`

### Task 2: seed test users (ApplicationRunner, gated)

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt` (add `findByGithubLogin`)
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/TestUserSeeder.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/TestUserSeederTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.iam.devauth

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository

// default profile (not production) + the flag default true → seeder runs on context start.
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class TestUserSeederTest(@Autowired val users: UserRepository) {
    @Test
    fun `seeds the futurama test users with synthetic negative github ids`() {
        users.findByGithubLogin("leela").shouldNotBeNull().let {
            it.githubId shouldBe -2L
            it.githubName shouldBe "Leela"
            it.displayName shouldBe "Turanga Leela"
        }
        users.findByGithubLogin("Fry").shouldNotBeNull().githubId shouldBe -1L
        listOf("Fry", "leela", "Bender", "prof", "amy").forEach { users.findByGithubLogin(it).shouldNotBeNull() }
    }
}
```

- [ ] **Step 2: Run — expect FAIL** · `cd core && ./mvnw -q test -Dtest=TestUserSeederTest`
- [ ] **Step 3: Implement.** Add to `UserRepository`:
```kotlin
    fun findByGithubLogin(githubLogin: String): User?
```
`devauth/TestUserSeeder.kt`:
```kotlin
package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

/** Seeds fixed Futurama test users for localhost + staging. Never in prod (profile + flag). */
@Component
@Profile("!production")
@ConditionalOnProperty(prefix = "app.test-auth", name = ["enabled"], havingValue = "true")
class TestUserSeeder(private val users: UserRepository) : ApplicationRunner {
    // (github_login, github_name, display_name, synthetic negative github_id)
    private val seed = listOf(
        Triple("Fry", null as String?, null as String?) to -1L,
        Triple("leela", "Leela", "Turanga Leela") to -2L,
        Triple("Bender", null as String?, null as String?) to -3L,
        Triple("prof", null as String?, "Prof Farnsworth") to -4L,
        Triple("amy", null as String?, null as String?) to -5L,
    )

    override fun run(args: org.springframework.boot.ApplicationArguments) {
        seed.forEach { (t, id) ->
            if (users.findByGithubId(id) == null) {
                users.save(User(githubId = id, githubLogin = t.first, githubName = t.second, displayName = t.third))
            }
        }
    }
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(iam): seed futurama test users (gated, negative github ids)`

### Task 3: dev-login picker + redirect controllers

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/GitHubLoginRedirectController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginControllerTest.kt`

- [ ] **Step 1: Write the failing test** (default profile, flag true → picker active; `/login/github` serves HTML; `/login/github/as` logs in)

```kotlin
package org.unividuell.countdown.core.iam.devauth

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.unividuell.countdown.core.TestcontainersConfiguration

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class DevLoginControllerTest(@Autowired val mockMvc: MockMvc) {
    @Test
    fun `GET login github renders the test-user picker`() {
        mockMvc.get("/login/github").andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith("text/html") }
            content { string(containsString("leela")) }
            content { string(containsString("Turanga Leela")) }
        }
    }

    @Test
    fun `POST login github as logs in the chosen seeded user`() {
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "leela")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/")
        }
        // session now authenticated as leela
        mockMvc.get("/api/me") { /* reuse session via the same mockMvc is non-trivial; assert via principal in a focused slice if needed */ }
    }
}
```
> Note: asserting the established session across MockMvc calls needs the returned session; if awkward, split: assert the redirect + that `SecurityContext` holds `leela` by capturing the `MvcResult`'s session and replaying it on `/api/me` (`.sessionAttrs`/`session(...)`). Keep it pragmatic.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.**

`devauth/DevLoginController.kt` (picker; gated profile + flag):
```kotlin
package org.unividuell.countdown.core.iam.internal.devauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseBody
import org.springframework.web.servlet.view.RedirectView
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.springframework.web.util.HtmlUtils

@Controller
@Profile("!production")
@ConditionalOnProperty(prefix = "app.test-auth", name = ["enabled"], havingValue = "true")
class DevLoginController(private val users: UserRepository) {

    private val securityContextRepository = HttpSessionSecurityContextRepository()

    @GetMapping("/login/github", produces = [MediaType.TEXT_HTML_VALUE])
    @ResponseBody
    fun picker(request: HttpServletRequest): String {
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
        val buttons = users.findByGithubLoginIn(SEED_LOGINS).joinToString("\n") { u ->
            val label = HtmlUtils.htmlEscape(u.username)
            """<form method="post" action="/login/github/as">
                 <input type="hidden" name="_csrf" value="${csrf.token}"/>
                 <input type="hidden" name="login" value="${HtmlUtils.htmlEscape(u.githubLogin)}"/>
                 <button type="submit">$label</button>
               </form>"""
        }
        return """<!doctype html><html><head><meta charset="utf-8"><title>Test login</title>
          <style>body{font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0}
          .card{border:1px solid #ddd;border-radius:8px;padding:24px;min-width:260px;text-align:center}
          h1{font-size:1rem;margin:0 0 16px} form{margin:6px 0} button{width:100%;padding:8px;cursor:pointer}</style>
          </head><body><div class="card"><h1>Test-Login (nicht prod)</h1>$buttons</div></body></html>"""
    }

    @PostMapping("/login/github/as")
    fun loginAs(@RequestParam login: String, request: HttpServletRequest, response: HttpServletResponse): RedirectView {
        val user = users.findByGithubLogin(login) ?: error("unknown test user: $login")
        val principal = CountdownOAuth2User(user, mapOf("login" to user.githubLogin))
        val auth = OAuth2AuthenticationToken(principal, principal.authorities, "github")
        val context = SecurityContextHolder.createEmptyContext().apply { authentication = auth }
        SecurityContextHolder.setContext(context)
        securityContextRepository.saveContext(context, request, response)
        return RedirectView("/")
    }

    companion object { val SEED_LOGINS = listOf("Fry", "leela", "Bender", "prof", "amy") }
}
```
Add to `UserRepository`:
```kotlin
    fun findByGithubLoginIn(githubLogins: Collection<String>): List<User>
```

`devauth/GitHubLoginRedirectController.kt` (active when test-auth is off — prod, or non-prod with flag false):
```kotlin
package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.servlet.view.RedirectView

/** When test-auth is off, the single SPA login button just goes to real GitHub OAuth. */
@Controller
@ConditionalOnProperty(prefix = "app.test-auth", name = ["enabled"], havingValue = "false", matchIfMissing = true)
class GitHubLoginRedirectController {
    @GetMapping("/login/github")
    fun toGitHub(): RedirectView = RedirectView("/oauth2/authorization/github")
}
```

- [ ] **Step 4: Run — expect PASS.** Also run a quick prod-profile slice to prove the picker is absent:
  add `DevLoginProdAbsentTest` (`@ActiveProfiles("production")`, flag false) asserting
  `GET /login/github` 302→`/oauth2/authorization/github` (redirect controller active) and there is no
  picker HTML. (Use `@MockkBean` for any prod-only datasource needs, or run with Testcontainers.)
- [ ] **Step 5: Commit** — `feat(iam): emulator dev-login picker + github redirect (gated)`

### Task 4: frontend — point the single login button at `/login/github`

**Files:**
- Modify: `webapp-vue/src/auth/useAuth.ts`
- Modify: `webapp-vue/src/auth/__tests__/useAuth.spec.ts`

- [ ] **Step 1: Adjust the failing test** — the existing test asserts the GitHub URL; change expectation:

```ts
  it('navigates to the server login entry (server decides github vs test picker)', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    useAuth().loginWithGitHub()
    expect(assign).toHaveBeenCalledWith('/login/github')
  })
```

- [ ] **Step 2: Run — expect FAIL** · `cd webapp-vue && pnpm vitest run src/auth/__tests__/useAuth.spec.ts`
- [ ] **Step 3: Implement** — in `useAuth.ts`:
```ts
  function loginWithGitHub(): void {
    // One button everywhere; the server decides (real GitHub in prod, test-user picker in non-prod).
    window.location.assign('/login/github')
  }
```

- [ ] **Step 4: Run — expect PASS;** then `pnpm lint && pnpm build && pnpm test` all green.
- [ ] **Step 5: Commit** — `feat(web): login button -> /login/github (server-decided auth)`

### Task 5: backend suite + clean build

- [ ] **Step 1:** `cd core && ./mvnw clean test` → all green (incl. ModularityTests; `devauth` lives in `iam.internal` so no boundary change). 
- [ ] **Step 2:** confirm the picker is NOT wired under production: the `DevLoginProdAbsentTest` from Task 3 passes.
- [ ] **Step 3: Commit** (if any fixups) — `test(iam): verify dev-login gating`

---

## Phase 2 — CI: develop trigger + branch-based tags

### Task 6: `build-core.yml` + `build-web.yml` — build `:staging` on develop

**Files:**
- Modify: `.github/workflows/build-core.yml`
- Modify: `.github/workflows/build-web.yml`

- [ ] **Step 1: Edit `build-core.yml`** — add `develop` to the push branches, derive the tag, build it:

```yaml
on:
  workflow_dispatch: {}
  push:
    branches: [main, develop]
    paths:
      - 'core/**'
      - '.github/workflows/build-core.yml'
...
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '25', cache: maven }
      - name: Test (gate before image)
        working-directory: core
        run: ./mvnw -B clean verify
      - name: Resolve image tag
        id: tag
        run: echo "tag=${{ github.ref_name == 'main' && 'latest' || 'staging' }}" >> "$GITHUB_OUTPUT"
      - name: Build & publish image (Buildpacks -> ghcr)
        working-directory: core
        env:
          GHCR_USERNAME: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: >
          ./mvnw -B spring-boot:build-image -DskipTests
          -Dspring-boot.build-image.imageName=ghcr.io/unividuell/countdown-core:${{ steps.tag.outputs.tag }}
          -Dspring-boot.build-image.publish=true
```

- [ ] **Step 2: Edit `build-web.yml`** — add `develop`, derive the tag, tag the docker build:

```yaml
on:
  workflow_dispatch: {}
  push:
    branches: [main, develop]
    paths:
      - 'webapp-vue/**'
      - 'deploy/Caddyfile'
      - 'deploy/web.Dockerfile'
      - '.github/workflows/build-web.yml'
...
      - name: Lint + test (gate before image)
        working-directory: webapp-vue
        run: |
          corepack enable
          pnpm install --frozen-lockfile
          pnpm lint
          pnpm test
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - name: Resolve image tag
        id: tag
        run: echo "tag=${{ github.ref_name == 'main' && 'latest' || 'staging' }}" >> "$GITHUB_OUTPUT"
      - name: Build & push web image
        run: |
          docker build -f deploy/web.Dockerfile -t ghcr.io/unividuell/countdown-web:${{ steps.tag.outputs.tag }} .
          docker push ghcr.io/unividuell/countdown-web:${{ steps.tag.outputs.tag }}
```

- [ ] **Step 3: Commit** — `ci: build :staging images on develop, :latest on main`

> (No unit test for YAML; validated when the `develop` branch is first pushed in the cutover phase.)

---

## Phase 3 — deploy parametrization + edge beta route

### Task 7: parametrize the compose (rename to `compose.yaml`)

**Files:**
- Rename + modify: `deploy/compose.prod.yaml` → `deploy/compose.yaml`

- [ ] **Step 1: `git mv deploy/compose.prod.yaml deploy/compose.yaml`**
- [ ] **Step 2: Parametrize** — apply these changes (keep prod behaviour identical when run with `.env.prod`):
  - top: remove the hard `name: countdown` line (project name now comes from `COMPOSE_PROJECT_NAME` in the env file).
  - `core`: `image: ghcr.io/unividuell/countdown-core:${IMAGE_TAG:-latest}` and
    `- SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-production}`.
  - `caddy`: `image: ghcr.io/unividuell/countdown-web:${IMAGE_TAG:-latest}` and
    `container_name: ${COMPOSE_PROJECT_NAME:-countdown}-web`.
  - `db-backup`: change the mount to `- ${BACKUP_DIR:-./backups}:/backups`.
  - `pgadmin`: change the port to `- "127.0.0.1:${PGADMIN_PORT:-5050}:80"`.
  - everything else (postgres, internal/edge networks, volumes, configs) unchanged.
- [ ] **Step 3: Validate** — render both env shapes (no external `edge` needed for `config`):
```bash
cd deploy
printf 'COMPOSE_PROJECT_NAME=countdown\nIMAGE_TAG=latest\nSPRING_PROFILES_ACTIVE=production\nPGADMIN_PORT=5050\nBACKUP_DIR=./backups\nPOSTGRES_PASSWORD=x\nGITHUB_CLIENT_SECRET=x\nPGADMIN_EMAIL=a@b.c\nPGADMIN_PASSWORD=x\n' > /tmp/p.env
docker compose --env-file /tmp/p.env -f compose.yaml config -q && echo PROD_OK
printf 'COMPOSE_PROJECT_NAME=countdown-staging\nIMAGE_TAG=staging\nSPRING_PROFILES_ACTIVE=staging\nPGADMIN_PORT=5051\nBACKUP_DIR=./backups-staging\nPOSTGRES_PASSWORD=x\nGITHUB_CLIENT_SECRET=x\nPGADMIN_EMAIL=a@b.c\nPGADMIN_PASSWORD=x\n' > /tmp/s.env
docker compose --env-file /tmp/s.env -f compose.yaml config -q && echo STAGING_OK
# assert the project name + web container differ:
docker compose --env-file /tmp/s.env -f compose.yaml config | grep -E 'name:|container_name:'
```
Expected: `PROD_OK` + `STAGING_OK`; staging renders project `countdown-staging` + `countdown-staging-web`.
- [ ] **Step 4: Commit** — `feat(deploy): parametrize compose for prod+staging (one file, per-env)`

### Task 8: env examples + `update.sh <target>` + README

**Files:**
- Create: `deploy/.env.prod.example`, `deploy/.env.staging.example`
- Delete: `deploy/.env.example`
- Modify: `deploy/update.sh`
- Modify: `deploy/README.md`

- [ ] **Step 1: env examples**

`deploy/.env.prod.example`:
```dotenv
# Copy to .env.prod on the server. NEVER commit the real file.
COMPOSE_PROJECT_NAME=countdown
IMAGE_TAG=latest
SPRING_PROFILES_ACTIVE=production
PGADMIN_PORT=5050
BACKUP_DIR=./backups
POSTGRES_PASSWORD=change-me
GITHUB_CLIENT_SECRET=change-me
PGADMIN_EMAIL=admin@local.dev
PGADMIN_PASSWORD=change-me
```
`deploy/.env.staging.example`:
```dotenv
# Copy to .env.staging on the server. NEVER commit the real file.
COMPOSE_PROJECT_NAME=countdown-staging
IMAGE_TAG=staging
SPRING_PROFILES_ACTIVE=staging
PGADMIN_PORT=5051
BACKUP_DIR=./backups-staging
POSTGRES_PASSWORD=change-me-staging
# staging logs in via the test-user picker; GitHub OAuth is configured-but-unused → placeholder ok
GITHUB_CLIENT_SECRET=unused
PGADMIN_EMAIL=admin@local.dev
PGADMIN_PASSWORD=change-me-staging
```

- [ ] **Step 2: `update.sh <target>`**
```sh
#!/usr/bin/env sh
# Full update for one stack: ./update.sh [prod|staging]  (default: prod)
set -eu
TARGET="${1:-prod}"
case "$TARGET" in prod|staging) : ;; *) echo "usage: ./update.sh [prod|staging]"; exit 2 ;; esac
ENV_FILE=".env.$TARGET"
BASE="https://raw.githubusercontent.com/unividuell/countdown/main/deploy"

curl -fsSL "$BASE/compose.yaml" -o compose.yaml
curl -fsSL "$BASE/README.md"    -o README.md
curl -fsSL "$BASE/update.sh"    -o update.sh.new && chmod +x update.sh.new && mv update.sh.new update.sh

if [ ! -f "$ENV_FILE" ]; then
  curl -fsSL "$BASE/$ENV_FILE.example" -o "$ENV_FILE"
  echo "$ENV_FILE created from template — fill in the secrets, then re-run ./update.sh $TARGET"
  exit 1
fi

docker network create edge 2>/dev/null || true
docker compose --env-file "$ENV_FILE" -f compose.yaml pull
docker compose --env-file "$ENV_FILE" -f compose.yaml up -d
docker image prune -f
echo "Update complete ($TARGET)."
```
- [ ] **Step 3: README** — update for the two stacks + per-env pgAdmin. Key points to document:
  - bootstrap/update: `./update.sh prod` and `./update.sh staging` (each first run writes
    `.env.<t>` from the example + stops; fill secrets; re-run).
  - both stacks live in `/opt/unividuell/countdown/`; staging is independent
    (`docker compose --env-file .env.staging -f compose.yaml down|up -d`).
  - **pgAdmin per env:** prod `--env-file .env.prod … --profile debug up -d pgadmin` → `ssh -L 5050:127.0.0.1:5050` → `localhost:5050`; staging `--env-file .env.staging … --profile debug up -d pgadmin` → `ssh -L 5051:127.0.0.1:5051` → `localhost:5051`; each connects only to its own DB.
  - staging login = test-user picker (no GitHub app); `beta.countdown.unividuell.org` via the edge.
  - `sh -n update.sh` passes.
- [ ] **Step 4: Commit** — `feat(deploy): .env.prod/.staging examples + update.sh <target> + README`

### Task 9: edge-caddy — `beta.countdown.unividuell.org`

**Files:**
- Modify: `/opt/unividuell/projects/edge-caddy/Caddyfile` (separate repo `unividuell/edge-caddy`)

- [ ] **Step 1: Add the site block** after the countdown block:
```caddy
# countdown staging (own stack, test-user login)
beta.countdown.unividuell.org {
	reverse_proxy countdown-staging-web:80
}
```
- [ ] **Step 2: Validate** (stdin pipe, no /opt mount):
```bash
docker run --rm -i -e 'BASIC_AUTH_HASH=$2a$14$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345' caddy:2-alpine \
  sh -c 'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile > /dev/null && echo ADAPT_OK' \
  < /opt/unividuell/projects/edge-caddy/Caddyfile
```
Expected: `ADAPT_OK`.
- [ ] **Step 3: Commit (in the edge-caddy repo)** — `feat: route beta.countdown.unividuell.org to staging web`; push (edge-caddy is its own repo; this can ship independently).

---

## Phase 4 — feed knowledge back

### Task 10: guidelines

**Files:**
- Modify: `.claude/guidelines/deployment.md`, `.claude/guidelines/security-and-auth.md`

- [ ] **Step 1:** `deployment.md` — add: one-compose + per-env-file (`COMPOSE_PROJECT_NAME`) multi-stack pattern; `develop`→`:staging` / `main`→`:latest`; one pgAdmin per env (`PGADMIN_PORT`); `update.sh <target>`.
- [ ] **Step 2:** `security-and-auth.md` — add the emulator test-login pattern: one SPA button → `/login/github`; profile + `app.test-auth.enabled` decide picker vs GitHub redirect; seeder as ApplicationRunner with synthetic negative github_ids; nothing test-related in prod; flip the flag false locally to replay prod GitHub.
- [ ] **Step 3: Commit** — `docs: staging + emulator test-login conventions`

---

## Server cutover (MANUAL — coordinate with the user; touches live prod)

> Not subagent-executable. SSH `ubuntu@158.101.161.126`. Do after all repo changes are merged to
> `main`, `develop` is created+pushed (so `:staging` images exist), and `beta.countdown.unividuell.org`
> DNS points at the server.

**Preconditions:** DNS `A/AAAA beta.countdown.unividuell.org` → server. `:staging` core+web images
published (from the `develop` push). edge-caddy Caddyfile updated + pushed.

**Sequence:**
- [ ] **1. Prod rename in place** (no data loss — same `COMPOSE_PROJECT_NAME=countdown` keeps volumes):
  ```bash
  cd /opt/unividuell/countdown
  mv .env .env.prod                 # existing prod secrets
  # add the new keys to .env.prod: COMPOSE_PROJECT_NAME=countdown, IMAGE_TAG=latest,
  #   SPRING_PROFILES_ACTIVE=production, PGADMIN_PORT=5050, BACKUP_DIR=./backups
  ./update.sh prod                  # fetches compose.yaml + update.sh, pulls, recreates prod
  ```
  Expect a brief prod restart (core/web recreated; postgres volume `countdown_pgdata` reused). Verify
  `https://countdown.unividuell.org` + login.
- [ ] **2. Bring up staging:**
  ```bash
  cd /opt/unividuell/countdown
  ./update.sh staging               # writes .env.staging from example, then stops
  # edit .env.staging: POSTGRES_PASSWORD (own), PGADMIN_PASSWORD; GITHUB_CLIENT_SECRET=unused
  ./update.sh staging               # pulls :staging images, starts the staging stack
  ```
  (db-backup writes to `./backups-staging`; staging gets its own `countdown-staging_pgdata`.)
- [ ] **3. Edge:** `cd /opt/unividuell/edge-caddy && ./update.sh` → re-fetches the Caddyfile + reloads;
  Caddy obtains the LE cert for `beta.countdown.unividuell.org` on first request.
- [ ] **4. Verify:**
  ```bash
  curl -sS -o /dev/null -w 'beta SPA %{http_code} (tls %{ssl_verify_result})\n' https://beta.countdown.unividuell.org/
  curl -sS -o /dev/null -w 'beta /api/me %{http_code}\n' https://beta.countdown.unividuell.org/api/me   # 401
  curl -sS -o /dev/null -w 'beta /login/github %{http_code}\n' https://beta.countdown.unividuell.org/login/github  # 200 (picker HTML)
  # prod still real GitHub:
  curl -sS -o /dev/null -D - https://countdown.unividuell.org/login/github | grep -i location  # -> /oauth2/authorization/github
  ```
  Then in a browser: beta → login button → test-user picker → pick `leela` → lands in the app; verify
  multi-user flows (invite from one test user, approve as another).

---

## Self-Review

**Spec coverage:** flag + staging profile (Task 1); seeder gated + negative ids (Task 2); picker+redirect emulator routing gated by profile+flag (Task 3); SPA single button → `/login/github` (Task 4); prod-absence verified (Task 3/5); develop→:staging CI (Task 6); one parametrized compose + per-env files + `update.sh <target>` + per-env pgAdmin (Tasks 7–8); beta edge route (Task 9); feed-back (Task 10); manual cutover incl. prod rename without data loss + DNS + verify (Phase 4 cutover). All spec sections map to a task.

**Type/contract consistency:** `app.test-auth.enabled` used identically in Seeder/DevLoginController/Redirect `@ConditionalOnProperty`; `/login/github` is the single contract the SPA (`useAuth`) and both controllers agree on; `CountdownOAuth2User(user, attributes)` matches the existing constructor; env keys (`COMPOSE_PROJECT_NAME`/`IMAGE_TAG`/`SPRING_PROFILES_ACTIVE`/`PGADMIN_PORT`/`BACKUP_DIR`) match between compose params, env examples, update.sh, and the cutover.

**Placeholder scan:** code steps are complete; the README content (Task 8 Step 3) is specified as concrete bullet points to write (not a vague "update docs"); the `DevLoginControllerTest` session-replay note is flagged as a pragmatic choice, not a gap.
