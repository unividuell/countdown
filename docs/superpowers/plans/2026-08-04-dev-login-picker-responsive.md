# Dev Login Picker: Mobile-First + 12 Futurama Test Users — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the non-prod test-login picker usable on a phone and grow its Futurama roster from 5 to 12 users.

**Architecture:** Two backend files in the `iam` module's `devauth` package. `TestUserSeeder` gains a
`SeedUser` data class carrying login, name fields, pinned negative `githubId`, an emoji and an accent
colour; its declaration order becomes the picker's render order. `DevLoginController.picker` keeps
being one self-contained server-rendered HTML string — it gains a viewport meta tag (the actual cause
of "too small on mobile"), a mobile-first stone-palette stylesheet with a dark-mode block, and rows
rendered from the seed list instead of from an unordered repository query.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Modulith 2.1 · Spring Data JDBC · Testcontainers
+ JUnit 5 + kotest assertions + MockMvc Kotlin DSL.

**Spec:** [`docs/superpowers/specs/2026-08-04-dev-login-picker-responsive-design.md`](../specs/2026-08-04-dev-login-picker-responsive-design.md)

## Global Constraints

- **Never reassign an existing `githubId`.** The seeder matches rows on `githubId`; the five current
  users keep -1…-5, new users take -6…-12. Reassigning would orphan rows in every dev/staging DB and
  insert duplicates.
- **`seedLogins` must stay a `List<String>` of accepted logins.** `DevLoginController.loginAs` uses it
  as the allowlist that prevents a caller from assuming any registered identity by name — including a
  super-admin one. Do not change its shape or drop it.
- **Nothing test-related may reach production.** Both classes stay `@Profile("!production")` +
  `@ConditionalOnProperty("app.test-auth.enabled")`. Do not touch those annotations.
- **No Futurama artwork.** Avatars are system emoji only. Show art is Disney IP; a redrawn but
  recognizable version is a derivative work. No images, no SVG likenesses, no external avatar service.
- **Do not reuse `community.internal.AvatarColor` / `MemberShortName`.** They are Modulith module
  internals and unreachable from `iam`. Accent colours are literals on the seed rows.
- **Keep the existing escaping.** `HtmlUtils.htmlEscape` on every interpolated user-derived value, one
  hidden `_csrf` field per form.
- **No frontend change.** `webapp-vue/` is not touched by this plan.
- **Commit style:** conventional commits; the *why* goes in the commit body, not into inline comments
  (see `.claude/guidelines/`). Branch is already `claude/login-page-responsive-futurama-cfefe1`, which
  targets `develop`.

## File Structure

| File | Responsibility |
|---|---|
| `core/src/main/kotlin/.../iam/internal/devauth/TestUserSeeder.kt` | Modify: add `SeedUser`, replace the 5-entry `Triple` list with 12 `SeedUser` rows, keep the converging upsert loop. |
| `core/src/test/kotlin/.../iam/devauth/TestUserSeederTest.kt` | Modify: assert all 12 logins + their pinned ids; assert the name-fallback rows. |
| `core/src/main/kotlin/.../iam/internal/devauth/DevLoginController.kt` | Modify: render rows from `seeder.seedUsers` in order, emoji chip markup, viewport meta, mobile-first CSS with dark mode, explicit UTF-8 content type. |
| `core/src/test/kotlin/.../iam/devauth/DevLoginControllerTest.kt` | Modify: viewport meta present, seed order preserved, a new seed login is loginable. |
| `core/README.md:28-29` | Modify: the sentence listing the five seeded users. |

`.../` above is `org/unividuell/countdown/core`.

---

### Task 1: Twelve seed users behind a `SeedUser` data class

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/TestUserSeeder.kt`
- Modify: `core/README.md:28-29`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/TestUserSeederTest.kt`

**Interfaces:**
- Consumes: `UserRepository.findByGithubId(Long): User?`, `UserRepository.save`,
  `SuperAdminProperties.isSuperAdmin(login: String): Boolean`, `User(githubId, githubLogin,
  githubName, displayName, isSuperAdmin)`.
- Produces, for Task 2:
  - `data class SeedUser(val login: String, val githubName: String?, val displayName: String?, val githubId: Long, val emoji: String, val accentHex: String)` — top-level in package `org.unividuell.countdown.core.iam.internal.devauth`.
  - `TestUserSeeder.seedUsers: List<SeedUser>` — public, declaration order = render order.
  - `TestUserSeeder.seedLogins: List<String>` — unchanged contract, now derived from `seedUsers`.

- [ ] **Step 1: Write the failing tests**

In `TestUserSeederTest.kt`, replace the body of the first class (`TestUserSeederTest`) — keep the two
other classes (`TestUserSeederAllowlistTest`, `TestUserSeederConvergenceTest`) exactly as they are,
they pin super-admin behaviour this task does not change:

```kotlin
// default profile (not production) + the flag default true → seeder runs on context start.
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class TestUserSeederTest(@Autowired val users: UserRepository) {
    @Test
    fun `seeds twelve futurama test users, each on its pinned negative github id`() {
        val expected = mapOf(
            "Fry" to -1L, "leela" to -2L, "Bender" to -3L, "prof" to -4L, "amy" to -5L,
            "hermes" to -6L, "zoidberg" to -7L, "scruffy" to -8L, "zapp" to -9L,
            "kif" to -10L, "nibbler" to -11L, "mom" to -12L,
        )
        expected.forEach { (login, githubId) ->
            users.findByGithubLogin(login).shouldNotBeNull().githubId shouldBe githubId
        }
    }

    @Test
    fun `keeps seed rows that exercise all three username fallbacks`() {
        // displayName wins over githubName
        users.findByGithubLogin("leela").shouldNotBeNull().let {
            it.githubName shouldBe "Leela"
            it.displayName shouldBe "Turanga Leela"
            it.username shouldBe "Turanga Leela"
        }
        // no displayName, no githubName → the handle
        users.findByGithubLogin("Fry").shouldNotBeNull().let {
            it.githubName shouldBe null
            it.username shouldBe "Fry"
        }
        // displayName only
        users.findByGithubLogin("prof").shouldNotBeNull().username shouldBe "Prof Farnsworth"
    }
}
```

Remove the now-unused `import io.kotest.matchers.collections.shouldHaveSize` (it was already unused).
The remaining imports stay as they are.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw -q test -Dtest='TestUserSeederTest' -DfailIfNoTests=false
```

Expected: FAIL. `seeds twelve futurama test users` fails on the first new login with a
`shouldNotBeNull` assertion error for `hermes` (only -1…-5 are seeded today). The
`username` test passes already — that is intended, it is a regression guard.

Testcontainers needs Docker running. If the container cannot start, that is an environment problem,
not a test failure — start Docker and re-run.

- [ ] **Step 3: Replace the seed list with `SeedUser` rows**

Rewrite `TestUserSeeder.kt` as:

```kotlin
package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * One seeded Futurama test identity. [emoji] and [accentHex] are presentation-only — they exist so
 * the picker's twelve rows stay apart at a glance, and are never persisted.
 */
data class SeedUser(
    val login: String,
    val githubName: String?,
    val displayName: String?,
    val githubId: Long,
    val emoji: String,
    val accentHex: String,
)

/** Seeds fixed Futurama test users for localhost + staging. Never in prod (profile + flag). */
@Component
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class TestUserSeeder(
    private val users: UserRepository,
    private val superAdminProperties: SuperAdminProperties,
) : ApplicationRunner {
    /**
     * Declaration order is the picker's render order. The synthetic negative ids are what rows are
     * matched on, so an id already in use must never be reassigned: dev and staging databases hold
     * -1..-5 already, and moving one would orphan its row and insert a duplicate beside it.
     */
    val seedUsers: List<SeedUser> = listOf(
        SeedUser("Fry", null, null, -1L, "🍕", "#ea580c"),
        SeedUser("leela", "Leela", "Turanga Leela", -2L, "👁️", "#7c3aed"),
        SeedUser("Bender", null, null, -3L, "🤖", "#64748b"),
        SeedUser("prof", null, "Prof Farnsworth", -4L, "🔬", "#0d9488"),
        SeedUser("amy", null, null, -5L, "💅", "#db2777"),
        SeedUser("hermes", null, "Hermes Conrad", -6L, "📋", "#15803d"),
        SeedUser("zoidberg", null, "Dr. Zoidberg", -7L, "🦞", "#dc2626"),
        SeedUser("scruffy", null, "Scruffy", -8L, "🧹", "#a16207"),
        SeedUser("zapp", null, "Zapp Brannigan", -9L, "🎖️", "#1d4ed8"),
        SeedUser("kif", null, "Kif Kroker", -10L, "😩", "#4d7c0f"),
        SeedUser("nibbler", null, "Nibbler", -11L, "🐾", "#0891b2"),
        SeedUser("mom", null, "Mom", -12L, "🏭", "#831843"),
    )

    /** Single source of truth for accepted test logins; DevLoginController restricts `loginAs` to these. */
    val seedLogins: List<String> = seedUsers.map { it.login }

    /**
     * Mirrors `UserProvisioningService.sync`: the allowlist is authoritative and re-evaluated on
     * every run, not just on insert — otherwise a seed user's flag, once set by hand, could never
     * converge back to what the allowlist says (nor could a newly-allowlisted seed login ever
     * pick up the role, since this runner only ever inserted before).
     */
    override fun run(args: org.springframework.boot.ApplicationArguments) {
        seedUsers.forEach { seed ->
            val isSuperAdmin = superAdminProperties.isSuperAdmin(seed.login)
            val existing = users.findByGithubId(seed.githubId)
            if (existing == null) {
                users.save(
                    User(
                        githubId = seed.githubId, githubLogin = seed.login, githubName = seed.githubName,
                        displayName = seed.displayName, isSuperAdmin = isSuperAdmin,
                    )
                )
            } else if (existing.isSuperAdmin != isSuperAdmin) {
                users.save(existing.copy(isSuperAdmin = isSuperAdmin))
            }
        }
    }
}
```

Note the file must be saved as UTF-8 — the emoji are source literals.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='TestUserSeederTest,TestUserSeederAllowlistTest,TestUserSeederConvergenceTest' -DfailIfNoTests=false
```

Expected: PASS, all three classes. The allowlist and convergence classes must still pass untouched —
they use `Fry` and `prof`, both of which kept their ids.

- [ ] **Step 5: Update the README's list of seeded users**

In `core/README.md`, replace lines 28-29's parenthetical. The current text reads:

```markdown
3. Log in at `http://localhost:8080/login/github` — a picker offers the seeded Futurama
   users (`Fry`, `leela`, `Bender`, `prof`, `amy`). Afterwards `GET /api/me` returns the
```

Change the parenthetical to:

```markdown
3. Log in at `http://localhost:8080/login/github` — a picker offers the seeded Futurama
   users (`Fry`, `leela`, `Bender`, `prof`, `amy`, `hermes`, `zoidberg`, `scruffy`, `zapp`,
   `kif`, `nibbler`, `mom`). Afterwards `GET /api/me` returns the
```

Leave the rest of the sentence and the surrounding steps untouched.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/TestUserSeeder.kt core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/TestUserSeederTest.kt core/README.md
git commit -m "$(cat <<'EOF'
feat(devauth): seed twelve Futurama test users instead of five

Five test identities were too few to exercise a multi-member view. The seed
rows now carry an emoji and an accent colour for the picker, which no longer
fits into a Triple, so they become a SeedUser data class.

The existing five keep github ids -1..-5: the seeder matches rows on
github_id, so reassigning one would leave its row in every dev and staging
database orphaned and insert a duplicate next to it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Picker renders in seed order, with a viewport meta tag and emoji chips

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginControllerTest.kt`

**Interfaces:**
- Consumes from Task 1: `TestUserSeeder.seedUsers: List<SeedUser>` (with `.login`, `.emoji`,
  `.accentHex`), `TestUserSeeder.seedLogins: List<String>`, `SeedUser`.
- Also consumes: `UserRepository.findByGithubLoginIn(Collection<String>): List<User>`,
  `User.username: String`, `User.githubLogin: String`.
- Produces: no new public API. `loginAs` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add three tests to `DevLoginControllerTest.kt`, and add the seeder to its constructor so the order
test can read the declared order rather than restating it:

```kotlin
class DevLoginControllerTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val users: UserRepository,
    @Autowired val seeder: TestUserSeeder,
) {
```

New imports for this file:

```kotlin
import io.kotest.matchers.ints.shouldBeGreaterThan
import org.unividuell.countdown.core.iam.internal.devauth.TestUserSeeder
```

The three tests:

```kotlin
    @Test
    fun `picker declares a mobile viewport`() {
        // Without this the page lays out at the browser's ~980px fallback width and is then scaled
        // down to fit — the whole reason the picker used to be unreadable on a phone.
        mockMvc.get("/login/github").andExpect {
            content { string(containsString("""<meta name="viewport" content="width=device-width,initial-scale=1">""")) }
        }
    }

    @Test
    fun `picker renders every seed user, in the seeder's declared order`() {
        val html = mockMvc.get("/login/github").andReturn().response.contentAsString

        val positions = seeder.seedUsers.map { html.indexOf("""name="login" value="${it.login}"""") }
        positions.forEach { it shouldBeGreaterThan -1 }
        // findByGithubLoginIn returns rows in no defined order; at twelve entries a list that
        // reshuffles between reloads would read as a bug.
        positions shouldBe positions.sorted()
    }

    @Test
    fun `POST login github as logs in a newly added seed user`() {
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "zoidberg")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/")
        }
    }
```

Leave the three existing tests (`renders the test-user picker`, `logs in the chosen seeded user`,
`rejects a login that exists but is not a seed user`) untouched — the last one is the allowlist guard.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw -q test -Dtest='DevLoginControllerTest' -DfailIfNoTests=false
```

Expected: FAIL.
- `picker declares a mobile viewport` — the substring is absent.
- `renders every seed user, in the seeder's declared order` — passes or fails depending on the
  database's row order, i.e. it is flaky *before* the fix. That is expected at this point; Step 4 is
  what makes it deterministic.
- `logs in a newly added seed user` — passes already (Task 1 seeded `zoidberg`); it is a guard that
  the new logins are actually reachable through `loginAs`'s allowlist.

- [ ] **Step 3: Render rows from the seed list**

In `DevLoginController.picker`, replace the `buttons` computation. Before:

```kotlin
        val buttons = users.findByGithubLoginIn(seeder.seedLogins).joinToString("\n") { u ->
            val label = HtmlUtils.htmlEscape(u.username)
            """<form method="post" action="/login/github/as">
                 <input type="hidden" name="_csrf" value="${csrf.token}"/>
                 <input type="hidden" name="login" value="${HtmlUtils.htmlEscape(u.githubLogin)}"/>
                 <button type="submit">$label</button>
               </form>"""
        }
```

After:

```kotlin
        val byLogin = users.findByGithubLoginIn(seeder.seedLogins).associateBy { it.githubLogin }
        val buttons = seeder.seedUsers.mapNotNull { seed ->
            val user = byLogin[seed.login] ?: return@mapNotNull null
            """<form method="post" action="/login/github/as">
                 <input type="hidden" name="_csrf" value="${csrf.token}"/>
                 <input type="hidden" name="login" value="${HtmlUtils.htmlEscape(seed.login)}"/>
                 <button type="submit">
                   <span class="chip" style="background:${seed.accentHex}">${seed.emoji}</span>
                   <span>${HtmlUtils.htmlEscape(user.username)}</span>
                 </button>
               </form>"""
        }.joinToString("\n")
```

`mapNotNull` rather than `error(...)`: a seed row whose user is missing (a database wiped between
startup and the request) should cost that one button, not the whole page.

Also change the mapping's `produces` so the emoji are written as UTF-8 deterministically rather than
relying on the converter's configured default:

```kotlin
    @GetMapping("/login/github", produces = ["text/html;charset=UTF-8"])
```

That drops the last use of `MediaType`, so remove `import org.springframework.http.MediaType`.

- [ ] **Step 4: Replace the inline stylesheet and head with a mobile-first one**

Replace the whole returned string literal in `picker` with:

```kotlin
        return """<!doctype html><html lang="de"><head><meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Test login</title>
          <style>
            :root{color-scheme:light dark;--bg:#fafaf9;--card:#fff;--border:#e7e5e4;--fg:#1c1917;--muted:#78716c;--hover:#f5f5f4}
            @media (prefers-color-scheme:dark){
              :root{--bg:#1c1917;--card:#292524;--border:#44403c;--fg:#fafaf9;--muted:#a8a29e;--hover:#44403c}
            }
            *{box-sizing:border-box}
            body{margin:0;padding:1.5rem 1rem;min-height:100dvh;display:flex;align-items:center;justify-content:center;
                 font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
            .card{width:100%;max-width:22rem;background:var(--card);border:1px solid var(--border);
                  border-radius:12px;padding:1.25rem}
            h1{font-size:.875rem;font-weight:600;margin:0 0 .25rem}
            p{font-size:.75rem;color:var(--muted);margin:0 0 1rem}
            form{margin:0 0 .5rem}
            form:last-of-type{margin-bottom:0}
            button{display:flex;align-items:center;gap:.75rem;width:100%;min-height:44px;padding:.5rem .75rem;
                   border:1px solid var(--border);border-radius:8px;background:transparent;color:inherit;
                   font:inherit;text-align:left;cursor:pointer}
            button:hover{background:var(--hover)}
            .chip{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;
                  font-size:15px;line-height:1}
          </style></head>
          <body><div class="card"><h1>Test-Login</h1><p>Nicht in Produktion verfügbar.</p>$buttons</div></body></html>"""
```

Why each piece:
- `min-height:100dvh` + body padding instead of `height:100vh`: at twelve rows on a small screen the
  card is taller than the viewport, and `height` clips it while `min-height` lets the page scroll.
  `dvh` rather than `vh` so a mobile browser's collapsing address bar does not cut the last row off.
- `width:100%;max-width:22rem` instead of `min-width:260px`: the card shrinks with a 320px screen
  instead of forcing horizontal overflow.
- `min-height:44px` on each button: the platform minimum tap target; `padding:8px` was below it.
- `color-scheme` + the `prefers-color-scheme` block: the picker follows the OS theme like the SPA.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='DevLoginControllerTest' -DfailIfNoTests=false
```

Expected: PASS, all six tests. In particular `renders the test-user picker` must still find both
`leela` and `Turanga Leela` — the label is still `user.username`, just wrapped in a `<span>`.

- [ ] **Step 6: Run the whole backend suite**

```bash
cd core && ./mvnw test
```

Expected: PASS. This catches anything else that leaned on the seed list's size or the picker's markup
(the Modulith verification test in particular — `SeedUser` is a new top-level type in an `internal`
package, which is allowed, but the suite is what proves it).

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginControllerTest.kt
git commit -m "$(cat <<'EOF'
fix(devauth): make the test-login picker usable on a phone

The picker had no viewport meta tag, so mobile browsers laid it out at their
~980px fallback width and scaled the result down — everything shrank
proportionally. That tag is the actual fix; the rest follows from it: the card
sizes to the screen instead of a 260px floor, rows are 44px tap targets, and
min-height:100dvh lets twelve rows scroll where height:100vh clipped them.

Rows now come from the seeder's list rather than findByGithubLoginIn, whose row
order is undefined — unnoticeable at five entries, a visible reshuffle at
twelve. The content type pins UTF-8 so the emoji chips do not depend on the
converter's configured default.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Verify in a real browser at mobile and desktop widths

No code is expected here. This task exists because the CSS claims of Task 2 are not provable by
MockMvc — a passing suite says the viewport tag is in the string, not that the page reads well at
375px. If this task turns up a problem, fix it and re-run Task 2's suite before committing.

**Files:**
- Modify (only if a defect is found): `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt`

- [ ] **Step 1: Start the backend**

Use the preview tooling, not a raw shell command — `.claude/launch.json` already defines the server:

```
preview_start with {name: "backend"}
```

It runs `./mvnw spring-boot:run` on port 8080 and brings up Postgres 18 via
`--spring.docker.compose.file=../compose.yaml`. Note the config sets
`SUPER_ADMIN_GITHUB_LOGINS=bender`, so `Bender` is the local super-admin — expected, not a bug.

Startup takes a while. Confirm it is up with `preview_logs` (look for the Tomcat/started line) before
navigating.

- [ ] **Step 2: Open the picker at a phone viewport**

```
resize_window with {preset: "mobile"}   // 375x812
navigate to http://localhost:8080/login/github
```

- [ ] **Step 3: Check it visually and structurally**

```
computer with {action: "screenshot"}
```

Confirm on the screenshot:
- Text is at normal reading size — not a shrunken-down desktop page. This is the whole point.
- All twelve rows present, each with a coloured emoji chip left of the name.
- No horizontal scrollbar; the card spans the width minus its margin.
- Names shown are `Fry`, `Turanga Leela`, `Bender`, `Prof Farnsworth`, `amy`, `Hermes Conrad`,
  `Dr. Zoidberg`, `Scruffy`, `Zapp Brannigan`, `Kif Kroker`, `Nibbler`, `Mom` — in that order.

Then confirm the page scrolls rather than clips, and that nothing overflows sideways:

```
javascript_tool: JSON.stringify({
  scrollH: document.documentElement.scrollHeight,
  clientH: document.documentElement.clientHeight,
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  minTapHeight: Math.min(...[...document.querySelectorAll('button')].map(b => b.getBoundingClientRect().height)),
})
```

Expected: `overflowX: false`, `minTapHeight` at least 44. If `scrollH > clientH`, scroll to the bottom
and screenshot again to confirm the last row (`Mom`) is reachable.

```
read_console_messages with {onlyErrors: true}
```

Expected: empty.

- [ ] **Step 4: Check dark mode and a desktop width**

```
resize_window with {preset: "mobile", colorScheme: "dark"}
computer with {action: "screenshot"}
```

Confirm the card is dark, text is legible, and the emoji chips still have enough contrast against the
dark card. If a chip colour washes out, adjust that one `accentHex` in `TestUserSeeder.seedUsers`.

```
resize_window with {preset: "desktop", colorScheme: "light"}
computer with {action: "screenshot"}
```

Confirm the card stays at its `22rem` max width, centred — it must not stretch across a 1280px window.

- [ ] **Step 5: Log in as a new seed user end to end**

```
find "Dr. Zoidberg"        // then click the returned ref
computer with {action: "left_click", ref: "<ref from find>"}
```

Expected: redirect to `/`. Then confirm the session really is Zoidberg's:

```
navigate to http://localhost:8080/api/me
get_page_text
```

Expected: JSON with `"githubLogin":"zoidberg"` and `"isSuperAdmin":false`.

- [ ] **Step 6: Stop the server and commit anything you had to change**

```
preview_stop with the serverId from Step 1
```

If Steps 3-5 required a fix, re-run `cd core && ./mvnw -q test -Dtest='DevLoginControllerTest' -DfailIfNoTests=false`
and commit:

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt
git commit -m "$(cat <<'EOF'
fix(devauth): <what the browser check turned up>

<why the CSS/colour needed changing — what it looked like at 375px>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

If nothing needed changing, there is nothing to commit — say so rather than inventing a commit.

---

## Done when

- `cd core && ./mvnw test` passes.
- The picker at 375px shows twelve legibly sized rows with emoji chips, scrolls, and has no
  horizontal overflow — evidenced by screenshots from Task 3.
- Logging in as `zoidberg` yields a session for that user.
- `core/README.md` lists all twelve seeded logins.
- No change under `webapp-vue/`, and no Futurama artwork anywhere in the diff.
