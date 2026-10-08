# countdown auf die Auth-Lib — Implementation Plan (Plan 2 von 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** countdown meldet sich über die Lib `org.unividuell:auth-spring-boot-starter` an: GitHub-Login über die GitHub App in Prod, Test-Login-Picker (mit Schloss auf staging) sonst, SPA-Vertrag und CSRF aus der Lib. countdown behält nur seine Konto-Tabelle, seine Zugriffsregeln und das Super-Admin-Roster.

**Architecture:** Die Lib besitzt alle Pfade unter `/login/` — der Einstieg zieht in Task 1 von `GET /login` nach `GET /login/start`, das nackte `/login` bleibt der SPA. Sie wird als `0.1.0` in das dateibasierte Maven-Repo `core/maven-repo/` deployt und committet. `iam.users` wird auf `(provider, subject)` umgeschlüsselt (`iam/V3`), alte Sessions fallen weg (`__root/V2`). `UserProvisioningService` wird der `AccountProvisioner` der Lib (ein `INSERT … ON CONFLICT … RETURNING id`); `AuthenticatedUser` wird ein `typealias` auf `AuthPrincipal`, sodass die Controller anderer Module nur einen Import dazubekommen.

**Tech Stack:** Spring Boot 4.1.1 · Kotlin 2.4.10 · Spring Security 7.1 · Spring Session JDBC · Spring Modulith 2.1.1 (modulbasiertes Flyway 12) · PostgreSQL 18 · Testcontainers · JUnit 5 + kotest-Matcher + mockk + MockMvc-Kotlin-DSL · Vue 3 + Vitest · pnpm.

**Spec:** [`docs/superpowers/specs/2026-10-03-auth-lib-design.md`](../specs/2026-10-03-auth-lib-design.md) — besonders „Umstellung von countdown“, „Tests“, „Abläufe je Umgebung“, „Schnittstelle Lib ↔ App“. Vor jedem Task lesen. Plan 1: [`2026-10-04-auth-lib.md`](2026-10-04-auth-lib.md).

**Wo:**

| | Pfad | Branch |
|---|---|---|
| Lib (Task 1, 2) | `/opt/unividuell/projects/auth-spring-boot-starter` | `main` |
| countdown (Task 2–6) | `/opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01` | `feature/centralized-social-login-auth-dfb589` |

In den Befehlen steht `$COUNTDOWN` für den countdown-Pfad und `$LIB` für den Lib-Pfad. Jeder Bash-Block setzt sie selbst:

```bash
COUNTDOWN=/opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
LIB=/opt/unividuell/projects/auth-spring-boot-starter
```

## Vorbereitung (Koordinator, vor Task 1)

- [ ] Docker läuft (`docker info >/dev/null && echo ok` → `ok`) — Testcontainers und der Start-Check in Task 4 brauchen es.
- [ ] `git -C $LIB status` → `nothing to commit, working tree clean` auf `main`; `git -C $COUNTDOWN status` → sauber auf `feature/centralized-social-login-auth-dfb589`.
- [ ] Solange ein Subagent in einem der beiden Repos arbeitet, committet der Koordinator dort nichts.
- [ ] **Push ist Koordinator-Sache, nach dem OK des Users** — nie die eines Subagenten: das Lib-Repo (`main` + Tag `v0.1.0`) und der countdown-Branch. Siehe „Von Hand und Auslieferung“.

## Global Constraints

- **Git:** countdown nach git flow — Branch von `develop`, PR gegen `develop`, nachziehen per **rebase, nie merge**. Lib: nur `main`. **Niemals `git commit --amend`.** Kein Push in den Tasks.
- **Commit-Messages** nach den 7 Regeln aus countdowns `CLAUDE.md`: Leerzeile zwischen Betreff und Body; Betreff ≤ 50 Zeichen (hart 72), groß, ohne Punkt, Imperativ („If applied, this commit will …“); Body umbrochen bei 72, erklärt *was* und *warum*. Kein `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Sprache:** Code, Kommentare, KDoc, Log- und Fehlermeldungen, Testnamen, Commit-Messages, READMEs **englisch**. Für Nutzer sichtbarer deutscher Text mit `„…“` (U+201E/U+201C), nie `"`.
- **Kotlin-Aufrufe:** benannte Argumente ab zwei Argumenten, auch in Tests. Ausnahmen: ein Argument, varargs (`param("login", "prof")`), Java-deklarierte Funktionen (`Cookie(…)`, `Flyway.configure()…`, `OAuth2AuthenticationToken(…)`), trailing lambdas, infix/operator.
- **KDoc-Falle:** Kotlin-Blockkommentare verschachteln sich. **Nie** ein Pfadmuster mit Schrägstrich und zwei Sternen (den Glob unter `/api/preview`) in einen KDoc oder `/* */`-Kommentar schreiben — der Rest der Datei verschwindet im Kommentar. In Prosa: „der `/api/super-admin`-Baum“. Zeilenkommentare (`//`) und YAML sind unkritisch.
- **Testing-Stack:** JUnit 5 als Runner, kotest **nur** als Matcher, mockk/`@MockkBean` (nie Mockito), MockMvc-Kotlin-DSL (`mockMvc.get(…) { }.andExpect { }`), Datenbank nur über **Testcontainers** (`@Import(TestcontainersConfiguration::class)`). Testcontainers braucht ein laufendes Docker.
- **TDD:** erst der fallende Test, Fehlschlag mit dem genannten Grund sehen, dann die minimale Implementierung.
- **Nach Löschungen und neuen Migrationen `./mvnw clean test`**, nie nur `./mvnw test` — gelöschte Klassen bleiben sonst in `target/classes`, und ein veraltetes `application-modules.json` lässt Migrationen still nicht laufen ([testing.md](../../../.claude/guidelines/testing.md), [modules-and-migrations.md](../../../.claude/guidelines/modules-and-migrations.md)).
- **Konfiguration:** Kein `application*.yaml`-Schlüssel ist unter Test (die Test-`application.yaml` *ersetzt* die Haupt-Datei). Nach jeder YAML-Änderung die App einmal starten ([configuration.md](../../../.claude/guidelines/configuration.md)). Ein Bean-Default wird in der YAML nicht wiederholt.
- **Persistenz:** Spring Data JDBC, kein `@Column`, IDs (UUID v7) setzt Postgres, Zeitstempel per Auditing.
- **Logging (falls Logs dazukommen):** kotlin-logging, `private val logger = KotlinLogging.logger {}` **in** der Klasse, immer Lambda-Nachrichten.
- **Kommentare:** knapp, *was* und *warum*; keine Grabstein-Kommentare; Code, den der Task nicht anfasst, bleibt unberührt.
- **Frontend:** nach Änderungen `pnpm test`, `pnpm lint`, `pnpm typecheck` (= `vue-tsc -b`) — alle grün.
- **Historische Design-Dokumente** unter `docs/superpowers/` (alte Specs und Pläne) bleiben unverändert; sie sind Protokoll. Die Abschluss-Greps schließen sie aus.

## Review Focus

1. **Zwei gleichzeitige Erst-Logins derselben Identität** (zwei Tabs, Doppelklick) — erwartet: eine Zeile, beide Aufrufe bekommen dieselbe ID, keine Exception. Der alte Weg (nachschlagen, einfügen, `DuplicateKeyException` fangen, neu lesen) konnte in Postgres nie gelingen: der Unique-Verstoß bricht die Transaktion ab. → Task 4, `UserProvisioningServiceRaceTest.two concurrent first sign-ins of one identity make one row`.
2. **Die eine echte Prod-Zeile nach der Migration** — `github_id = 123` muss zu `github`/`"123"` werden und vom GitHub-Login der App (Lib-Abbildung `subject = id.toString()`) wiedergefunden werden, statt eine zweite Zeile anzulegen. → Task 3, `IdentityMigrationTest.iam V3 keys real rows as github by id and seeded rows as test by login`; Task 4, `UserProvisioningServiceTest.a GitHub row from before the lib is found again by its numeric id`.
3. **`SUPER_ADMINS` ohne Präfix** (`bender` statt `test:bender` — der Wert, den die `.env`-Dateien heute unter dem alten Namen tragen; wer nur umbenennt, landet hier) — erwartet: Start verweigert mit `lacks the provider prefix`, nicht still „niemand ist Super-Admin“. → Lib: `StartupChecksTest.refuses a role entry without provider prefix`; countdown: Task 4, Step 13 (Fehlstart von Hand); dokumentiert in Task 6 (`deploy/README.md`).
4. **„Spieler wechseln“ mit einer Lab-URL voller `?`, `&`, `{`** — erwartet: der Picker trägt die URL escaped durch, `POST /login/test/as` landet wieder exakt auf ihr. → Task 4, `TestLoginEndToEndTest.switching players returns to the exact lab URL`; Task 5, `lab-controls.spec.ts`.
5. **Alte Sessions nach dem Deploy** — sie halten den gelöschten `CountdownOAuth2User` JDK-serialisiert; erwartet: 401 und frischer Login, nie ein 500 aus der Deserialisierung. → Task 3, `IdentityMigrationTest.root V2 empties the session store, attributes included`.

## Dateistruktur

```
/opt/unividuell/projects/auth-spring-boot-starter
├── README.md                                             Task 1
├── pom.xml                                               Task 2 (0.1.0, dann 0.2.0-SNAPSHOT)
└── src
    ├── main/kotlin/org/unividuell/auth/
    │   ├── AuthAutoConfiguration.kt                      Task 1 — loginPage
    │   └── internal/
    │       ├── LoginController.kt                        Task 1 — GET /login/start
    │       ├── LoginPages.kt                             Task 1 — Link der Fehlerseite
    │       ├── ProviderFailureHandler.kt                 Task 1 — /login/start?error
    │       ├── ProviderUserService.kt                    Task 1 — KDoc
    │       └── TestLoginController.kt                    Task 1 — Redirects
    └── test/kotlin/org/unividuell/auth/
        ├── AnonymousSessionTest.kt                       Task 1
        ├── ProviderLoginTest.kt                          Task 1 (+ nacktes /login → 404)
        ├── TestLoginAbsentTest.kt                        Task 1
        ├── TestLoginLockedTest.kt                        Task 1
        └── TestLoginTest.kt                              Task 1 (+ nacktes /login → 404)

countdown (Worktree)
├── CLAUDE.md                                             Task 6
├── .claude/launch.json                                   Task 4
├── .claude/guidelines/
│   ├── security-and-auth.md                              Task 6 (neu geschrieben)
│   ├── testing.md, persistence.md, logging.md,
│   │   frontend.md, game-lab.md, deployment.md,
│   │   deployment-edge.md, dependency-updates.md,
│   │   README.md                                         Task 6
├── .run/CoreApplication.run.xml                          Task 4
├── core/
│   ├── README.md                                         Task 6
│   ├── pom.xml                                           Task 2 (<repository>), Task 4 (Dependency)
│   ├── maven-repo/org/unividuell/auth-spring-boot-starter/…   Task 2 (neu, committet)
│   └── src/
│       ├── main/resources/
│       │   ├── application.yaml, application-production.yaml,
│       │   │   application-staging.yaml                  Task 4
│       │   └── db/migration/
│       │       ├── iam/V3__key_users_by_provider_and_subject.sql   Task 3 (neu)
│       │       └── __root/V2__drop_all_sessions.sql                Task 3 (neu)
│       ├── main/kotlin/org/unividuell/countdown/core/
│       │   ├── iam/User.kt                               Task 3
│       │   ├── iam/AuthenticatedUser.kt                  Task 4 (typealias + isSuperAdmin)
│       │   ├── iam/internal/UserRepository.kt            Task 3, Task 4
│       │   ├── iam/internal/UserProvisioningService.kt   Task 3, Task 4 (AccountProvisioner)
│       │   ├── iam/internal/SecurityConfig.kt            Task 4
│       │   ├── iam/internal/SuperAdminRosterService.kt   Task 4
│       │   ├── iam/internal/UserController.kt            Task 4
│       │   ├── iam/internal/GitHubOAuth2UserService.kt   Task 3, gelöscht in Task 4
│       │   ├── iam/internal/devauth/TestUserSeeder.kt    Task 3, gelöscht in Task 4
│       │   ├── iam/internal/{CsrfCookieFilter,CountdownOAuth2User,SuperAdminProperties}.kt   gelöscht in Task 4
│       │   ├── iam/internal/devauth/{DevLoginController,FakeSignInGate,GitHubLoginRedirectController}.kt   gelöscht in Task 4
│       │   └── community/internal/{CommunityController,MemberController,MemberProfileController}.kt,
│       │       countdown/internal/CountdownController.kt, game/internal/RoundController.kt,
│       │       gamelab/internal/LabController.kt,
│       │       imagepool/internal/{ImagePoolController,SuperAdminImageController}.kt   Task 4 (ein Import)
│       ├── test/resources/application.yaml               Task 4
│       └── test/kotlin/org/unividuell/countdown/core/
│           ├── TestPrincipals.kt                         Task 3 (Skript), Task 4
│           ├── TestcontainersConfiguration.kt            Task 4 (KDoc)
│           ├── iam/IdentityMigrationTest.kt              Task 3 (neu)
│           ├── iam/UserRepositoryTest.kt                 Task 3
│           ├── iam/UserProvisioningServiceTest.kt        Task 3, Task 4
│           ├── iam/UserProvisioningServiceRaceTest.kt    Task 3, Task 4 (neu als Testcontainers-Test)
│           ├── iam/SuperAdminRosterServiceTest.kt        Task 3 (Skript), Task 4
│           ├── iam/SuperAdminRosterControllerTest.kt     Task 4
│           ├── iam/SuperAdminUserServiceTest.kt          Task 3 (Skript), Task 4
│           ├── iam/TestLoginEndToEndTest.kt              Task 4 (neu)
│           ├── iam/{CountdownOAuth2UserTest,GitHubOAuth2UserServiceTest}.kt   Task 3, gelöscht in Task 4
│           ├── iam/SuperAdminPropertiesTest.kt           gelöscht in Task 4
│           ├── iam/devauth/{DevLoginControllerTest,DevLoginLockedTest,DevLoginProdAbsentTest,
│           │   FakeSignInGateTest,TestUserSeederTest}.kt  Task 3 (teils), gelöscht in Task 4
│           ├── community/SuperAdminOverviewServiceTest.kt   Task 3
│           ├── community/CommunityCreationClearanceSeamTest.kt   Task 3, Task 4
│           └── alle übrigen Testdateien mit `githubId = …`   Task 3 (Skript)
├── deploy/
│   ├── compose.yaml, .env.prod.example, .env.staging.example, README.md   Task 6
│   └── Caddyfile                                         Task 6 (Kommentar)
└── webapp-vue/
    ├── dev-proxy.ts                                      Task 5 (Kommentar)
    └── src/
        ├── auth/useAuth.ts                               Task 5
        ├── gamelab/LabControls.vue                       Task 5
        ├── api/types.ts                                  Task 5 (Kommentar)
        ├── auth/__tests__/useAuth.spec.ts, auth/__tests__/postLoginRedirect.spec.ts,
        │   pages/__tests__/login.spec.ts, __tests__/dev-proxy.spec.ts   Task 5
        └── gamelab/__tests__/lab-controls.spec.ts        Task 5 (neu)
```

---

### Task 1: Lib — Einstieg nach `/login/start`

Die Lib belegt heute `GET /login` — countdowns SPA-Seite. Danach antwortet sie unter `/login/start`, leitet Fehler auf `/login/start?error` und lässt das nackte `/login` unbelegt (404).

**Files:**
- Modify: `$LIB/src/main/kotlin/org/unividuell/auth/AuthAutoConfiguration.kt`
- Modify: `$LIB/src/main/kotlin/org/unividuell/auth/internal/LoginController.kt`, `LoginPages.kt`, `ProviderFailureHandler.kt`, `ProviderUserService.kt` (nur KDoc), `TestLoginController.kt`
- Modify (Tests): `$LIB/src/test/kotlin/org/unividuell/auth/AnonymousSessionTest.kt`, `ProviderLoginTest.kt`, `TestLoginAbsentTest.kt`, `TestLoginLockedTest.kt`, `TestLoginTest.kt`
- Modify: `$LIB/README.md`

**Interfaces:**
- Consumes: die Lib wie in Plan 1 gebaut (`LoginController(testLoginProvider: ObjectProvider<TestLoginService>, clients: ObjectProvider<ClientRegistrationRepository>)`, `TestLoginController(testLogin: TestLoginService)`, `ProviderFailureHandler()`, `LoginPages.error()`).
- Produces:
  - `GET /login/start[?redirect=…]` — Picker, Schloss oder `302` auf `/oauth2/authorization/{id}`; `GET /login/start?error` — Fehlerseite, nie Redirect, Link „Erneut versuchen“ auf `/login/start`.
  - `GET /login` — unbelegt, `404`.
  - `oauth2Login { loginPage = "/login/start" }`; `ProviderFailureHandler` → `/login/start?error`.
  - `POST /login/test/as`: Schloss zu → `/login/start`; Provisioner wirft → `/login/start?error`. `POST /login/test/unlock`: → `/login/start` bzw. `/login/start?redirect=<URLEncoder>`.
  - Unverändert: Gate-Cookie `Path=/login` (deckt `/login/start` und `/login/test/*`).

- [ ] **Step 1: Tests auf `/login/start` umstellen** — alle String-Literale `"/login"` und `"/login?…"` in den fünf Testdateien; `/login/test/…`, `/login/oauth2/…`, `/login/nothing`, `/login/anything` und `"Path=/login"` bleiben, weil nach `/login` dort weder `"` noch `?` folgt bzw. kein `"` davor steht:

```bash
LIB=/opt/unividuell/projects/auth-spring-boot-starter
cd $LIB/src/test/kotlin/org/unividuell/auth
perl -pi -e 's{"/login(?=[?"])}{"/login/start}g' \
  AnonymousSessionTest.kt ProviderLoginTest.kt TestLoginAbsentTest.kt TestLoginLockedTest.kt TestLoginTest.kt
grep -c '/login/start' AnonymousSessionTest.kt ProviderLoginTest.kt TestLoginAbsentTest.kt TestLoginLockedTest.kt TestLoginTest.kt
```

Expected:

```
AnonymousSessionTest.kt:5
ProviderLoginTest.kt:6
TestLoginAbsentTest.kt:1
TestLoginLockedTest.kt:7
TestLoginTest.kt:6
```

- [ ] **Step 2: Neue Tests — das nackte `/login` gehört der App**

In `ProviderLoginTest.kt` den KDoc der Klasse anpassen — ersetze

```kotlin
 * Production: one client, no test login. `/login` belongs to the provider. A fresh context:
```

durch

```kotlin
 * Production: one client, no test login. `/login/start` belongs to the provider. A fresh context:
```

und den ersten Test (nach Step 1 lautet er so)

```kotlin
    @Test
    fun `GET login sends the browser to the only provider`() {
        // Spring's own generated login page would answer 200 here, before any controller.
        mockMvc.get("/login/start").andExpect {
            status { isFound() }
            redirectedUrl("/oauth2/authorization/github")
        }
    }
```

durch

```kotlin
    @Test
    fun `GET login start sends the browser to the only provider`() {
        mockMvc.get("/login/start").andExpect {
            status { isFound() }
            redirectedUrl("/oauth2/authorization/github")
        }
    }

    @Test
    fun `the bare login path stays the app's`() {
        // An SPA routes /login itself. Spring's own generated login page would answer 200 here.
        mockMvc.get("/login").andExpect { status { isNotFound() } }
    }
```

In `TestLoginTest.kt` ersetze

```kotlin
        positions.forEach { it shouldBeGreaterThan -1 }
        positions shouldBe positions.sorted()
    }

    @Test
    fun `signing in provisions the test identity and lands on the root`() {
```

durch

```kotlin
        positions.forEach { it shouldBeGreaterThan -1 }
        positions shouldBe positions.sorted()
    }

    @Test
    fun `the bare login path stays the app's while the picker is on`() {
        mockMvc.get("/login").andExpect { status { isNotFound() } }
    }

    @Test
    fun `signing in provisions the test identity and lands on the root`() {
```

- [ ] **Step 3: Fehlschlag prüfen**

Run: `cd $LIB && ./mvnw -q test`
Expected: FAIL in `ProviderLoginTest`, `TestLoginTest`, `TestLoginLockedTest`, `TestLoginAbsentTest`, `AnonymousSessionTest` — u. a. `Status expected:<200> but was:<404>` für `GET /login/start`, `Redirected URL expected:</login/start?error> but was:</login?error>`, und die beiden neuen Tests mit `Status expected:<404> but was:<302>` bzw. `<200>`.

- [ ] **Step 4: Implementieren**

`AuthAutoConfiguration.kt` — ersetze

```kotlin
                oauth2Login {
                    loginPage = "/login"
```

durch

```kotlin
                oauth2Login {
                    loginPage = "/login/start"
```

`internal/LoginController.kt` — ersetze

```kotlin
/**
 * Owns `GET /login`, the one URL the SPA's sign-in button points at: the picker while the test login
 * is on, the provider otherwise. Spring's generated login page stays off because oauth2Login names
 * this URL as its login page.
 *
```

durch

```kotlin
/**
 * Owns `GET /login/start`, the one URL the SPA's sign-in button points at: the picker while the test
 * login is on, the provider otherwise. Spring's generated login page stays off because oauth2Login
 * names this URL as its login page. The bare `/login` stays unmapped: an SPA routes it itself, and
 * edge and dev proxy forward only the paths below it.
 *
```

und

```kotlin
    @GetMapping("/login")
```

durch

```kotlin
    @GetMapping("/login/start")
```

`internal/LoginPages.kt` — ersetze

```kotlin
          <a class="action" href="/login">Erneut versuchen</a>""",
```

durch

```kotlin
          <a class="action" href="/login/start">Erneut versuchen</a>""",
```

`internal/ProviderFailureHandler.kt` — ersetze

```kotlin
        redirectStrategy.sendRedirect(request, response, "/login?error")
```

durch

```kotlin
        redirectStrategy.sendRedirect(request, response, "/login/start?error")
```

`internal/ProviderUserService.kt` — ersetze im KDoc

```kotlin
 * `/login?error` instead of failing the callback request.
```

durch

```kotlin
 * `/login/start?error` instead of failing the callback request.
```

`internal/TestLoginController.kt` — ersetze

```kotlin
        if (!testLogin.gate.isOpen(request)) return redirectTo("/login")
```

durch

```kotlin
        if (!testLogin.gate.isOpen(request)) return redirectTo("/login/start")
```

ersetze

```kotlin
            return redirectTo("/login?error")
```

durch

```kotlin
            return redirectTo("/login/start?error")
```

und ersetze

```kotlin
        val target = if (redirect.isNullOrBlank()) {
            "/login"
        } else {
            "/login?redirect=" + URLEncoder.encode(redirect, StandardCharsets.UTF_8)
        }
```

durch

```kotlin
        val target = if (redirect.isNullOrBlank()) {
            "/login/start"
        } else {
            "/login/start?redirect=" + URLEncoder.encode(redirect, StandardCharsets.UTF_8)
        }
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd $LIB && ./mvnw -q test`
Expected: PASS, alle grün.

Run: `cd $LIB && grep -rnE '"/login["?]' src`
Expected: genau drei Treffer — das Gate-Cookie und die beiden neuen 404-Tests:

```
src/main/kotlin/org/unividuell/auth/internal/FakeSignInGate.kt:57:            .path("/login")
src/test/kotlin/org/unividuell/auth/ProviderLoginTest.kt:…:        mockMvc.get("/login").andExpect { status { isNotFound() } }
src/test/kotlin/org/unividuell/auth/TestLoginTest.kt:…:        mockMvc.get("/login").andExpect { status { isNotFound() } }
```

- [ ] **Step 6: README** — `$LIB/README.md`, ersetze

```markdown
| `GET /login` | picker | key, then picker | redirect to the provider |
```

durch

```markdown
| `GET /login/start` | picker | key, then picker | redirect to the provider |
```

und ersetze

```markdown
- An unauthenticated request gets **401**, never a redirect. The SPA sends the browser to `/login`
  (with `?redirect=/path` to come back there after a test login).
```

durch

```markdown
- An unauthenticated request gets **401**, never a redirect. The SPA sends the browser to
  `/login/start` (with `?redirect=/path` to come back there after a test login). The bare `/login`
  stays the app's own route: the starter maps nothing there.
```

- [ ] **Step 7: Commit**

```bash
cd /opt/unividuell/projects/auth-spring-boot-starter
git add README.md src
git commit -F - <<'EOF'
Move the sign-in entry to /login/start

An SPA routes its bare /login itself (countdown's sign-in page lives
there), while the edge and the dev proxy forward only /login/* to the
backend. The starter now answers under /login/start, sends failures to
/login/start?error and leaves /login unmapped, so it can never shadow
the app's page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Lib `0.1.0` nach countdown

Release der Lib in countdowns dateibasiertes Maven-Repo. `core/pom.xml` bekommt nur das `<repository>` — **ohne** die Dependency: allein eingebunden ließe sie den Start scheitern, weil countdown noch keinen `AccountProvisioner` hat.

**Files:**
- Modify: `$LIB/pom.xml` (über `versions:set`)
- Create: `$COUNTDOWN/core/maven-repo/org/unividuell/auth-spring-boot-starter/…` (über `deploy`)
- Modify: `$COUNTDOWN/core/pom.xml`

**Interfaces:**
- Consumes: Task 1 (Lib-`main`, Tests grün).
- Produces:
  - Lib-Tag `v0.1.0` auf dem Commit „Release 0.1.0“; Lib-`main` danach auf `0.2.0-SNAPSHOT`.
  - `org.unividuell:auth-spring-boot-starter:0.1.0` (jar + pom) in `core/maven-repo/`, erreichbar über `<repository><id>unividuell-local</id><url>file://${project.basedir}/maven-repo</url></repository>`.

- [ ] **Step 1: Version setzen und bauen**

```bash
LIB=/opt/unividuell/projects/auth-spring-boot-starter
cd $LIB
./mvnw -B -q versions:set -DnewVersion=0.1.0 -DgenerateBackupPoms=false
grep -n '<version>0.1.0</version>' pom.xml
./mvnw -B verify
```

Expected: `13:	<version>0.1.0</version>`; danach `BUILD SUCCESS`, alle Tests grün.

- [ ] **Step 2: Release-Commit und Tag**

```bash
cd /opt/unividuell/projects/auth-spring-boot-starter
git commit -a -F - <<'EOF'
Release 0.1.0

The first version an app consumes: countdown deploys it into its
committed core/maven-repo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git tag v0.1.0
git tag --points-at HEAD
```

Expected: `v0.1.0`.

- [ ] **Step 3: In countdowns `core/maven-repo/` deployen**

```bash
COUNTDOWN=/opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
cd /opt/unividuell/projects/auth-spring-boot-starter
./mvnw -B deploy -DskipTests -Dmaven.install.skip=true \
  -DaltDeploymentRepository=app::file://$COUNTDOWN/core/maven-repo
find $COUNTDOWN/core/maven-repo -type f | sort
```

Expected: `BUILD SUCCESS`; unter `org/unividuell/auth-spring-boot-starter/` liegen `maven-metadata.xml` sowie in `0.1.0/` `auth-spring-boot-starter-0.1.0.jar` und `auth-spring-boot-starter-0.1.0.pom`, jede Datei mit `.md5` und `.sha1` daneben. `-Dmaven.install.skip=true` hält `~/.m2` leer, sonst fiele ein fehlendes `<repository>` erst in CI auf.

- [ ] **Step 4: Nächste Snapshot-Version**

```bash
cd /opt/unividuell/projects/auth-spring-boot-starter
./mvnw -B -q versions:set -DnewVersion=0.2.0-SNAPSHOT -DgenerateBackupPoms=false
git commit -a -F - <<'EOF'
Start 0.2.0-SNAPSHOT

The next release is a minor one while the starter is 0.x.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -3
```

Expected: `Start 0.2.0-SNAPSHOT`, `Release 0.1.0`, `Move the sign-in entry to /login/start`.

- [ ] **Step 5: `<repository>` in `core/pom.xml`** — ersetze

```xml
		<countdown.image.tag>latest</countdown.image.tag>
	</properties>
	<dependencies>
```

durch

```xml
		<countdown.image.tag>latest</countdown.image.tag>
	</properties>
	<repositories>
		<!-- The auth lib is not on Maven Central: each app commits the lib's file repository
		     (the lib's README, "Releasing"). -->
		<repository>
			<id>unividuell-local</id>
			<url>file://${project.basedir}/maven-repo</url>
		</repository>
	</repositories>
	<dependencies>
```

- [ ] **Step 6: Auflösbarkeit mit leerem lokalem Repo prüfen** — beweist, dass der Build nur das committete Verzeichnis braucht, nicht `~/.m2` (braucht Netz für Maven Central):

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core
TMP_REPO=$(mktemp -d)
./mvnw -B dependency:get -Dartifact=org.unividuell:auth-spring-boot-starter:0.1.0 -Dtransitive=false \
  -Dmaven.repo.local="$TMP_REPO" | grep -E 'Downloaded from unividuell-local|BUILD'
rm -rf "$TMP_REPO"
./mvnw -B -q validate && echo valid
```

Expected:

```
[INFO] Downloaded from unividuell-local: file:///…/core/maven-repo/org/unividuell/auth-spring-boot-starter/0.1.0/auth-spring-boot-starter-0.1.0.jar (…)
[INFO] BUILD SUCCESS
valid
```

- [ ] **Step 7: Commit (countdown)**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
git add core/pom.xml core/maven-repo
git commit -F - <<'EOF'
Ship the auth lib 0.1.0 in core/maven-repo

The lib is not on Maven Central. Each app commits the lib's file
repository and points Maven at it, so no machine and no CI needs a
token or registry configuration. The dependency follows with the
switch: on its own it would refuse to start, as countdown provides no
AccountProvisioner yet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Identitäts-Spalten `(provider, subject)`

`iam.users` wird auf `(provider, subject)` umgeschlüsselt, der Rest von countdown zieht minimal nach — noch ohne Lib. Danach ist die Suite grün, und Task 4 kann die Anmeldung in einem Zug tauschen.

**Entscheidung:** eine Migration `iam/V3` statt der drei Schritte „expand, switch, contract“ aus [persistence.md](../../../.claude/guidelines/persistence.md) — die Spec legt `V3` so fest, und der Grund für die Teilung (der Backfill ist sonst unprüfbar) entfällt: `IdentityMigrationTest` migriert bis `V2`, legt echte Zeilen an und prüft den Backfill nach `V3`.

**Entscheidung:** `User.provider` bekommt den Default `"github"`. Die rund 60 Testdateien ändern sich dann mechanisch (`githubId = 1L` → `subject = "1"`), wie die Spec es vorsieht; Produktionscode setzt den Provider immer selbst (Task 3: Seeder und GitHub-Service, Task 4: SQL).

**Files:**
- Create: `core/src/main/resources/db/migration/iam/V3__key_users_by_provider_and_subject.sql`
- Create: `core/src/main/resources/db/migration/__root/V2__drop_all_sessions.sql`
- Create (Test): `core/src/test/kotlin/org/unividuell/countdown/core/iam/IdentityMigrationTest.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt`, `UserProvisioningService.kt`, `GitHubOAuth2UserService.kt`, `devauth/TestUserSeeder.kt`
- Modify (Tests): `iam/UserRepositoryTest.kt`, `iam/UserProvisioningServiceTest.kt`, `iam/UserProvisioningServiceRaceTest.kt`, `iam/GitHubOAuth2UserServiceTest.kt`, `iam/devauth/TestUserSeederTest.kt`, `community/SuperAdminOverviewServiceTest.kt`, `community/CommunityCreationClearanceSeamTest.kt` und per Skript jede Testdatei mit `githubId = …` (unter `core/src/test/kotlin/org/unividuell/countdown/core/`)

**Interfaces:**
- Consumes: nichts Neues.
- Produces:
  - Schema: `iam.users.provider TEXT NOT NULL`, `iam.users.subject TEXT NOT NULL`, `UNIQUE (provider, subject)` als `users_provider_subject_key`; `github_id` entfällt samt Unique-Constraint. `spring_session` ist leer.
  - `data class User(id: UUID? = null, provider: String = "github", subject: String, githubLogin: String, …)` — `githubId` entfällt.
  - `UserRepository.findByProviderAndSubject(provider: String, subject: String): User?` statt `findByGithubId(githubId: Long)`.
  - Übergangsweise (Task 4 ersetzt sie): `UserProvisioningService.provision(provider: String, subject: String, login: String, name: String?, email: String?): User`.

- [ ] **Step 1: Den fallenden Migrations-Test schreiben** — `core/src/test/kotlin/org/unividuell/countdown/core/iam/IdentityMigrationTest.kt`

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.TestcontainersConfiguration
import java.sql.DriverManager
import java.sql.SQLException

/**
 * The migrations that move countdown onto the auth lib, run against rows that exist before them —
 * which no Spring test sees, because a context migrates its database while it is still empty.
 * Flyway runs per module the way Spring Modulith runs it (one history table each); every test gets
 * a database of its own on the shared server.
 */
class IdentityMigrationTest {

    private val database = TestcontainersConfiguration().jdbcConnectionDetails()

    /** [module]'s migrations up to [version], or all of them. */
    private fun migrate(module: String, version: String? = null) {
        val configuration = Flyway.configure()
            .dataSource(database.jdbcUrl, database.username, database.password)
            .locations("classpath:db/migration/$module")
            .table(if (module == "__root") "flyway_schema_history" else "flyway_schema_history_$module")
            .baselineVersion("0")
            .baselineOnMigrate(true)
        if (version != null) configuration.target(version)
        configuration.load().migrate()
    }

    private fun execute(sql: String) {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.createStatement().use { it.execute(sql) }
        }
    }

    private fun rows(sql: String): List<List<String?>> =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(sql).use { result ->
                    buildList {
                        while (result.next()) add((1..result.metaData.columnCount).map { result.getString(it) })
                    }
                }
            }
        }

    @Test
    fun `iam V3 keys real rows as github by id and seeded rows as test by login`() {
        migrate(module = "iam", version = "2")
        execute("INSERT INTO iam.users (github_id, github_login) VALUES (123, 'octocat'), (-4, 'prof')")

        migrate(module = "iam")

        rows("SELECT github_login, provider, subject FROM iam.users ORDER BY github_login") shouldBe listOf(
            listOf("octocat", "github", "123"),
            listOf("prof", "test", "prof"),
        )
    }

    @Test
    fun `iam V3 drops github_id and makes provider plus subject the unique key`() {
        migrate(module = "iam")

        rows(
            "SELECT column_name FROM information_schema.columns " +
                "WHERE table_schema = 'iam' AND table_name = 'users' AND column_name = 'github_id'",
        ).shouldBeEmpty()
        execute("INSERT INTO iam.users (provider, subject, github_login) VALUES ('github', '7', 'a')")
        // The same subject at another provider is another account.
        execute("INSERT INTO iam.users (provider, subject, github_login) VALUES ('test', '7', 'b')")
        shouldThrow<SQLException> {
            execute("INSERT INTO iam.users (provider, subject, github_login) VALUES ('github', '7', 'c')")
        }
        shouldThrow<SQLException> {
            execute("INSERT INTO iam.users (subject, github_login) VALUES ('8', 'd')")
        }
    }

    @Test
    fun `root V2 empties the session store, attributes included`() {
        migrate(module = "__root", version = "1")
        execute(
            "INSERT INTO spring_session (primary_id, session_id, creation_time, last_access_time, " +
                "max_inactive_interval, expiry_time, principal_name) VALUES ('p1', 's1', 0, 0, 1800, 0, 'someone')",
        )
        execute(
            "INSERT INTO spring_session_attributes (session_primary_id, attribute_name, attribute_bytes) " +
                "VALUES ('p1', 'SPRING_SECURITY_CONTEXT', decode('aced', 'hex'))",
        )

        migrate(module = "__root")

        rows("SELECT count(*) FROM spring_session") shouldBe listOf(listOf("0"))
        rows("SELECT count(*) FROM spring_session_attributes") shouldBe listOf(listOf("0"))
    }
}
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd $COUNTDOWN/core && ./mvnw -q test -Dtest=IdentityMigrationTest`
Expected: FAIL, 3 Tests — `ERROR: column "provider" does not exist`; die `github_id`-Spalte ist noch da (Liste nicht leer); `expected:<[[0]]> but was:<[[1]]>`.

- [ ] **Step 3: Die zwei Migrationen**

`core/src/main/resources/db/migration/iam/V3__key_users_by_provider_and_subject.sql`:

```sql
-- Accounts are keyed by (provider, subject), the way the auth lib hands every sign-in over. Real
-- rows keep GitHub's numeric id as text; the old seeder's synthetic negative ids become provider
-- 'test', keyed by login, which is exactly how the lib's test users sign in. A github_id of 0
-- matches neither UPDATE and fails the NOT NULL below, loudly, on purpose.
ALTER TABLE iam.users
    ADD COLUMN provider TEXT,
    ADD COLUMN subject  TEXT;

UPDATE iam.users SET provider = 'test',   subject = github_login    WHERE github_id < 0;
UPDATE iam.users SET provider = 'github', subject = github_id::text WHERE github_id > 0;

-- Dropping github_id drops its UNIQUE constraint with it.
ALTER TABLE iam.users
    ALTER COLUMN provider SET NOT NULL,
    ALTER COLUMN subject  SET NOT NULL,
    ADD CONSTRAINT users_provider_subject_key UNIQUE (provider, subject),
    DROP COLUMN github_id;
```

`core/src/main/resources/db/migration/__root/V2__drop_all_sessions.sql`:

```sql
-- Every stored session holds countdown's old JDK-serialized principal, which the auth lib replaces.
-- Left in place, each would fail to deserialize and answer 500 instead of 401; this way everyone
-- signs in once more. spring_session_attributes follows through ON DELETE CASCADE.
DELETE FROM spring_session;
```

- [ ] **Step 4: Migrations-Test laufen lassen**

Run: `cd $COUNTDOWN/core && ./mvnw -q test -Dtest=IdentityMigrationTest`
Expected: PASS (3 Tests).

- [ ] **Step 5: Den fallenden Repository-Test schreiben** — `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserRepositoryTest.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserRepositoryTest(@Autowired val repository: UserRepository) {

    @Test
    fun `saves a new user and assigns a uuid v7 id`() {
        val saved = repository.save(
            User(subject = "4711", githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        saved.id.shouldNotBeNull().version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        saved.updatedAt.shouldNotBeNull()
    }

    @Test
    fun `finds a user by provider and subject`() {
        repository.save(User(subject = "1234", githubLogin = "hubert", githubName = null, email = null))

        val found = repository.findByProviderAndSubject(provider = "github", subject = "1234")

        found.shouldNotBeNull()
        found.githubLogin shouldBe "hubert"
        repository.findByProviderAndSubject(provider = "github", subject = "9999").shouldBeNull()
    }

    @Test
    fun `the same subject at another provider is another user`() {
        repository.save(User(provider = "github", subject = "77", githubLogin = "octo-77"))
        repository.save(User(provider = "test", subject = "77", githubLogin = "test-77"))

        repository.findByProviderAndSubject(provider = "test", subject = "77").shouldNotBeNull()
            .githubLogin shouldBe "test-77"
    }

    @Test
    fun `stores no community-creation clearance by default and round-trips it`() {
        val saved = repository.save(User(subject = "5150", githubLogin = "newcomer"))
        saved.communityCreationAllowed shouldBe false

        val cleared = repository.save(saved.copy(communityCreationAllowed = true))

        repository.findByProviderAndSubject(provider = "github", subject = "5150")!!.communityCreationAllowed shouldBe true
        cleared.mayCreateCommunities shouldBe true
    }
}
```

Subject `77`, nicht `prof`: in diesem Task committet der Seeder `test`/`prof` noch in jeden Kontext, ein zweites `test`/`prof` verletzte den Unique-Key.

- [ ] **Step 6: Fehlschlag prüfen**

Run: `cd $COUNTDOWN/core && ./mvnw -q test -Dtest=UserRepositoryTest`
Expected: FAIL beim Kompilieren — `No parameter with name 'subject' found` und `Unresolved reference 'findByProviderAndSubject'`.

- [ ] **Step 7: `User` und `UserRepository`**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/User.kt` — ersetze

```kotlin
    @Id
    val id: UUID? = null,
    val githubId: Long,
    val githubLogin: String,
```

durch

```kotlin
    @Id
    val id: UUID? = null,
    /** "github", or "test" for a test user; unique together with [subject]. */
    val provider: String = "github",
    /** The provider's stable id, always text: GitHub's numeric id, a test user's login. */
    val subject: String,
    val githubLogin: String,
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt` — ersetze

```kotlin
    fun findByGithubId(githubId: Long): User?
```

durch

```kotlin
    fun findByProviderAndSubject(provider: String, subject: String): User?
```

- [ ] **Step 8: Die Aufrufer minimal nachziehen**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProvisioningService.kt` — ersetze

```kotlin
    /** Upserts the user from GitHub claims; never touches user-owned fields. */
    @Transactional
    open fun provision(githubId: Long, login: String, name: String?, email: String?): User {
        val isSuperAdmin = superAdminProperties.isSuperAdmin(login)
        repository.findByGithubId(githubId)?.let { existing ->
            return repository.save(sync(existing, login, name, email, isSuperAdmin))
        }
        return try {
            repository.save(
                User(
                    githubId = githubId,
                    githubLogin = login,
```

durch

```kotlin
    /** Upserts the user from the provider's claims; never touches user-owned fields. */
    @Transactional
    open fun provision(provider: String, subject: String, login: String, name: String?, email: String?): User {
        val isSuperAdmin = superAdminProperties.isSuperAdmin(login)
        repository.findByProviderAndSubject(provider = provider, subject = subject)?.let { existing ->
            return repository.save(sync(existing, login, name, email, isSuperAdmin))
        }
        return try {
            repository.save(
                User(
                    provider = provider,
                    subject = subject,
                    githubLogin = login,
```

und ersetze

```kotlin
            val existing = repository.findByGithubId(githubId)
                ?: throw IllegalStateException(
                    "DuplicateKeyException on insert but no row found for githubId=$githubId", e
                )
```

durch

```kotlin
            val existing = repository.findByProviderAndSubject(provider = provider, subject = subject)
                ?: throw IllegalStateException(
                    "DuplicateKeyException on insert but no row found for $provider:$subject", e
                )
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/GitHubOAuth2UserService.kt` — ersetze

```kotlin
        val githubId = (attributes["id"] as? Number)?.toLong()
            ?: throw invalidClaims("missing or non-numeric 'id' in GitHub attributes")
        val login = attributes["login"] as? String
            ?: throw invalidClaims("missing or non-string 'login' in GitHub attributes")
        val user = provisioning.provision(
            githubId = githubId,
            login = login,
```

durch

```kotlin
        val id = (attributes["id"] as? Number)?.toLong()
            ?: throw invalidClaims("missing or non-numeric 'id' in GitHub attributes")
        val login = attributes["login"] as? String
            ?: throw invalidClaims("missing or non-string 'login' in GitHub attributes")
        val user = provisioning.provision(
            provider = "github",
            subject = id.toString(),
            login = login,
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/TestUserSeeder.kt` — die zwölf Einträge verlieren ihre ID (das Skript lässt die Emojis samt Variationszeichen unberührt):

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core
perl -pi -e 's/, -\d+L,/,/' src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/TestUserSeeder.kt
grep -c 'SeedUser("' src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/TestUserSeeder.kt
```

Expected: `12`. Dann in derselben Datei ersetze

```kotlin
    val displayName: String?,
    val githubId: Long,
    val emoji: String,
```

durch

```kotlin
    val displayName: String?,
    val emoji: String,
```

ersetze

```kotlin
    /**
     * Declaration order is the picker's render order. The synthetic negative ids are what rows are
     * matched on, so an id already in use must never be reassigned: every dev and staging database
     * already holds the ids handed out so far, and moving one would orphan its row and insert a
     * duplicate beside it. A new character takes the next id counting down, never a freed one.
     */
```

durch

```kotlin
    /**
     * Declaration order is the picker's render order. Rows are matched on provider "test" with the
     * login as subject, so a login once handed out is never renamed: every dev and staging database
     * already holds its row, and a new spelling would insert a duplicate beside it.
     */
```

ersetze

```kotlin
     * once drifted by hand (or by a past roster edit that renamed a login without moving its
     * pinned `githubId`), could never converge back to what `seedUsers` says. This matters
```

durch

```kotlin
     * once drifted by hand, could never converge back to what `seedUsers` says. This matters
```

und ersetze

```kotlin
            val existing = users.findByGithubId(seed.githubId)
            if (existing == null) {
                users.save(
                    User(
                        githubId = seed.githubId, githubLogin = seed.login, githubName = seed.githubName,
                        displayName = seed.displayName, isSuperAdmin = isSuperAdmin,
                    )
                )
```

durch

```kotlin
            val existing = users.findByProviderAndSubject(provider = "test", subject = seed.login)
            if (existing == null) {
                users.save(
                    User(
                        provider = "test", subject = seed.login, githubLogin = seed.login,
                        githubName = seed.githubName, displayName = seed.displayName, isSuperAdmin = isSuperAdmin,
                    )
                )
```

- [ ] **Step 9: Tests mechanisch umstellen** — jedes `githubId = <Zahl>L` wird `subject = "<Zahl>"`, jedes `githubId = System.nanoTime()` wird `subject = System.nanoTime().toString()`; `provider` fällt auf den Default `"github"`:

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core
perl -pi -e 's/githubId = (-?\d+)L\b/subject = "$1"/g; s/githubId = System\.nanoTime\(\)/subject = System.nanoTime().toString()/g' \
  $(grep -rl 'githubId = ' src/test/kotlin)
grep -rn 'githubId' src/test/kotlin
```

Expected — nur noch die Stellen, die die folgenden Hand-Änderungen erledigen:

```
src/test/kotlin/org/unividuell/countdown/core/iam/devauth/TestUserSeederTest.kt:28:        expected.forEach { (login, githubId) ->
src/test/kotlin/org/unividuell/countdown/core/iam/devauth/TestUserSeederTest.kt:29:            users.findByGithubLogin(login).shouldNotBeNull().githubId shouldBe githubId
src/test/kotlin/org/unividuell/countdown/core/iam/devauth/TestUserSeederTest.kt:97:            it.githubId shouldBe -4L
src/test/kotlin/org/unividuell/countdown/core/community/SuperAdminOverviewServiceTest.kt:51:        User(id = id, githubId = id.leastSignificantBits, githubLogin = login, displayName = name)
src/test/kotlin/org/unividuell/countdown/core/community/CommunityCreationClearanceSeamTest.kt:51:        users.save(User(githubId = login.hashCode().toLong(), githubLogin = login))
```

(Reihenfolge kann abweichen.) Dazu die Aufrufe mit dem alten Methodennamen bzw. der alten Signatur — `grep -rn 'findByGithubId\|provision(' src/test/kotlin` zeigt sie in `UserProvisioningServiceTest.kt`, `UserProvisioningServiceRaceTest.kt`, `GitHubOAuth2UserServiceTest.kt`.

- [ ] **Step 10: Die Hand-Änderungen in den Tests**

`community/SuperAdminOverviewServiceTest.kt` — ersetze

```kotlin
        User(id = id, githubId = id.leastSignificantBits, githubLogin = login, displayName = name)
```

durch

```kotlin
        User(id = id, subject = id.toString(), githubLogin = login, displayName = name)
```

`community/CommunityCreationClearanceSeamTest.kt` — ersetze

```kotlin
        users.save(User(githubId = login.hashCode().toLong(), githubLogin = login))
```

durch

```kotlin
        users.save(User(subject = login, githubLogin = login))
```

`iam/devauth/TestUserSeederTest.kt` — ersetze

```kotlin
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
```

durch

```kotlin
    @Test
    fun `seeds twelve futurama test users, each as provider test keyed by its login`() {
        val logins = listOf(
            "Fry", "leela", "Bender", "prof", "amy", "hermes", "zoidberg", "scruffy", "zapp", "kif", "nibbler", "mom",
        )
        logins.forEach { login ->
            users.findByProviderAndSubject(provider = "test", subject = login).shouldNotBeNull()
                .githubLogin shouldBe login
        }
    }
```

und ersetze

```kotlin
            it.githubId shouldBe -4L
```

durch

```kotlin
            it.subject shouldBe "prof"
```

`iam/GitHubOAuth2UserServiceTest.kt` — ersetze beide Vorkommen von

```kotlin
provisioning.provision(4711L, "octocat", "The Octocat", "cat@example.com")
```

(in `every { … }` und in `verify(exactly = 1) { … }`) durch

```kotlin
provisioning.provision(provider = "github", subject = "4711", login = "octocat", name = "The Octocat", email = "cat@example.com")
```

`iam/UserProvisioningServiceRaceTest.kt` — ersetze

```kotlin
    // Simulates a concurrent insert: findByGithubId misses first (insert path),
```

durch

```kotlin
    // Simulates a concurrent insert: findByProviderAndSubject misses first (insert path),
```

ersetze

```kotlin
        every { repo.findByGithubId(42L) } returnsMany listOf(null, existing)
```

durch

```kotlin
        every { repo.findByProviderAndSubject(provider = "github", subject = "42") } returnsMany listOf(null, existing)
```

ersetze

```kotlin
        val result = service.provision(42L, "new-login", "New Name", "new@example.com")
```

durch

```kotlin
        val result = service.provision(
            provider = "github", subject = "42", login = "new-login", name = "New Name", email = "new@example.com",
        )
```

und ersetze

```kotlin
        verify(exactly = 2) { repo.findByGithubId(42L) }
```

durch

```kotlin
        verify(exactly = 2) { repo.findByProviderAndSubject(provider = "github", subject = "42") }
```

`iam/UserProvisioningServiceTest.kt` vollständig ersetzen (Task 4 schreibt ihn ein zweites Mal neu):

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=bossuser", "app.test-auth.enabled=false"])
class UserProvisioningServiceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `first login inserts a new user`() {
        val user = service.provision(
            provider = "github", subject = "100", login = "octocat", name = "The Octocat", email = "cat@example.com",
        )

        user.provider shouldBe "github"
        user.subject shouldBe "100"
        user.githubLogin shouldBe "octocat"
        user.githubName shouldBe "The Octocat"
        user.email shouldBe "cat@example.com"
        user.isSuperAdmin shouldBe false
        user.displayName.shouldBeNull()
        repository.count() shouldBe 1
    }

    @Test
    fun `repeat login syncs github fields but preserves user-owned fields`() {
        val first = service.provision(
            provider = "github", subject = "101", login = "old-login", name = "Old Name", email = "old@example.com",
        )
        // simulate user-owned edits
        repository.save(first.copy(displayName = "Mr. Custom", bgColorHex = "#ff0000"))

        val synced = service.provision(
            provider = "github", subject = "101", login = "new-login", name = "New Name", email = "new@example.com",
        )

        synced.githubLogin shouldBe "new-login"
        synced.githubName shouldBe "New Name"
        synced.email shouldBe "new@example.com"
        synced.displayName shouldBe "Mr. Custom"
        synced.bgColorHex shouldBe "#ff0000"
        repository.count() shouldBe 1
    }

    @Test
    fun `super-admin flag follows the allowlist on every login`() {
        val notSuperAdmin = service.provision(provider = "github", subject = "102", login = "regular", name = null, email = null)
        notSuperAdmin.isSuperAdmin shouldBe false

        val superAdmin = service.provision(provider = "github", subject = "103", login = "bossuser", name = null, email = null)
        superAdmin.isSuperAdmin shouldBe true
    }
}
```

- [ ] **Step 11: Gesamte Suite**

Run: `cd $COUNTDOWN/core && ./mvnw clean test`
Expected: `BUILD SUCCESS`, alle grün (`clean`: neue Migrationen, siehe Global Constraints).

Run: `cd $COUNTDOWN && grep -rn 'githubId\|GithubId' core/src`
Expected: keine Ausgabe.

- [ ] **Step 12: Commit**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
git add core/src
git commit -F - <<'EOF'
Key accounts by provider and subject

The auth lib hands every sign-in over as (provider, subject), the
subject always a string. iam/V3 turns the one real row into
github/<id> and the seeder's synthetic negative ids into test/<login>,
so both keep their rows. __root/V2 empties the session store: every
session holds a principal class the next commit removes, and a stale
one would answer 500 instead of 401.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Anmelden über die Lib

Der atomare Wechsel: Dependency, Provisioner, Löschungen, `SecurityConfig`, `typealias`, Roster, Konfiguration und Tests in einem Commit — dazwischen gibt es keinen startfähigen Zustand (die Lib verlangt einen `AccountProvisioner`, countdowns alter `oauth2Login` kollidierte mit ihrem).

**Entscheidung:** Das Upsert ist eine Repository-Methode mit `@Query` (ohne `@Modifying`, weil `RETURNING id` eine Zeile liefert), keine `NamedParameterJdbcTemplate` im Service — alle Upserts im Repo stehen so in ihrem Repository (`CommunityUserSelectionRepository.upsert`, `RoundPlayRepository`), und `CommunityUserSelectionRepository.findCommunityId` liefert eine `UUID` auf demselben Weg.

**Entscheidung:** Die Test-`application.yaml` behält ihren Platzhalter-Client. Ohne ihn starten Kontexte mit `unividuell.auth.test-login.enabled=false` nicht („No way to sign in“), und genau diesen Schalter nutzen `SuperAdminUserServiceTest` und `CommunityCreationClearanceSeamTest` für einen eigenen Kontext.

**Entscheidung:** Die Test-Overrides `app.test-auth.enabled=false` werden zu `unividuell.auth.test-login.enabled=false` statt zu verschwinden — sie geben ihrer Klasse weiter einen eigenen Kontext samt Datenbank, in die kein anderer Test committete Nutzer schreibt (die Test-Logins in `TestLoginEndToEndTest` committen).

**Entscheidung:** `application-production.yaml` behält den Schalter als `unividuell.auth.test-login.enabled: false` — doppelt gesichert wie `app.game-lab.enabled`; der Wert weicht vom Default ab, also darf er stehen.

**Entscheidung:** `User` bleibt `Serializable`. Kein Principal trägt ihn mehr in die Session, aber das Entfernen gehört nicht zu diesem Wechsel.

**Entscheidung:** Der Start-Check in Step 12/13 läuft gegen ein Wegwerf-Postgres, nicht gegen die geteilte Dev-Datenbank (`compose.yaml` heißt fest `countdown`): `iam/V3` dort anzuwenden, ließe jeden Checkout auf `develop` an `github_id` scheitern.

**Files:**
- Modify: `core/pom.xml`
- Delete: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/CsrfCookieFilter.kt`, `CountdownOAuth2User.kt`, `GitHubOAuth2UserService.kt`, `SuperAdminProperties.kt`, das Verzeichnis `iam/internal/devauth/` (`DevLoginController.kt`, `FakeSignInGate.kt`, `GitHubLoginRedirectController.kt`, `TestUserSeeder.kt`)
- Delete (Tests): `core/src/test/kotlin/org/unividuell/countdown/core/iam/CountdownOAuth2UserTest.kt`, `GitHubOAuth2UserServiceTest.kt`, `SuperAdminPropertiesTest.kt`, das Verzeichnis `iam/devauth/` (`DevLoginControllerTest.kt`, `DevLoginLockedTest.kt`, `DevLoginProdAbsentTest.kt`, `FakeSignInGateTest.kt`, `TestUserSeederTest.kt`) — ihr Gegenstück lebt in der Lib (Spec, „Tests“)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/AuthenticatedUser.kt`, `iam/internal/SecurityConfig.kt`, `iam/internal/UserRepository.kt`, `iam/internal/UserProvisioningService.kt`, `iam/internal/SuperAdminRosterService.kt`, `iam/internal/UserController.kt`
- Modify (ein Import): `community/internal/CommunityController.kt`, `community/internal/MemberController.kt`, `community/internal/MemberProfileController.kt`, `countdown/internal/CountdownController.kt`, `game/internal/RoundController.kt`, `gamelab/internal/LabController.kt`, `imagepool/internal/ImagePoolController.kt`, `imagepool/internal/SuperAdminImageController.kt` — mit `AuthenticatedUser.kt`, `UserQuery.kt` (KDoc-Verweis, bleibt) und dem gelöschten `CountdownOAuth2User.kt` die elf Dateien, die `AuthenticatedUser` nennen
- Modify: `core/src/main/resources/application.yaml`, `application-production.yaml`, `application-staging.yaml`, `core/src/test/resources/application.yaml`, `.claude/launch.json`, `.run/CoreApplication.run.xml`
- Modify (Tests): `TestPrincipals.kt`, `TestcontainersConfiguration.kt` (KDoc), `iam/UserProvisioningServiceTest.kt`, `iam/UserProvisioningServiceRaceTest.kt`, `iam/SuperAdminRosterServiceTest.kt`, `iam/SuperAdminRosterControllerTest.kt`, `iam/SuperAdminUserServiceTest.kt`, `community/CommunityCreationClearanceSeamTest.kt`
- Create (Test): `core/src/test/kotlin/org/unividuell/countdown/core/iam/TestLoginEndToEndTest.kt`

**Interfaces:**
- Consumes (Lib `0.1.0`, Package `org.unividuell.auth`):
  - `fun interface AccountProvisioner { fun provision(identity: ExternalIdentity, roles: Set<String>): UUID }`
  - `data class ExternalIdentity(provider: String, subject: String, login: String, name: String?, email: String?)`
  - `class AuthPrincipal(id: UUID, provider: String, login: String, roles: Set<String>) : OAuth2User, Serializable` — Authorities `ROLE_USER` + `ROLE_<rolle>`
  - Bean `RoleAllowlist` mit `fun members(role: String): List<RoleMember>`; `data class RoleMember(provider: String, login: String)`, beide kleingeschrieben
  - Konfiguration `unividuell.auth.roles.<rolle>`, `unividuell.auth.test-login.{enabled,key}`, `unividuell.auth.csrf-cookie.excluded-paths`; Endpunkte `GET /login/start`, `POST /login/test/as`, `POST /logout`
  - Aus Task 3: `User(provider, subject, …)`, `UserRepository.findByProviderAndSubject(provider, subject)`
- Produces:
  - `typealias AuthenticatedUser = AuthPrincipal` und `val AuthPrincipal.isSuperAdmin: Boolean` in `org.unividuell.countdown.core.iam`
  - `class UserProvisioningService(repository: UserRepository) : AccountProvisioner`
  - `UserRepository.upsertIdentity(provider: String, subject: String, login: String, name: String?, email: String?, isSuperAdmin: Boolean): UUID`, `UserRepository.findByProviderAndGithubLoginLowercaseIn(provider: String, logins: Collection<String>): List<User>`; `findByGithubLogin`, `findByGithubLoginIn`, `findByGithubLoginLowercaseIn` entfallen
  - `data class SuperAdminUserResponse(provider: String, githubLogin: String, username: String?, userId: UUID?, flagged: Boolean, allowlisted: Boolean, createdAt: Instant?)` — das Frontend braucht dafür nichts (ein zusätzliches JSON-Feld)
  - Testhelfer `fun principalFor(user: User): RequestPostProcessor` baut einen `AuthPrincipal`, Rolle `SUPER_ADMIN` genau bei `user.isSuperAdmin`

- [ ] **Step 1: Dependency** — `core/pom.xml`, ersetze

```xml
		<kotlin-logging.version>8.0.4</kotlin-logging.version>
```

durch

```xml
		<kotlin-logging.version>8.0.4</kotlin-logging.version>
		<!-- Ours, from core/maven-repo: not on Maven Central (see dependency-updates.md). -->
		<unividuell-auth.version>0.1.0</unividuell-auth.version>
```

und ersetze

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-security-oauth2-client</artifactId>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-session-jdbc</artifactId>
		</dependency>
```

durch

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-security-oauth2-client</artifactId>
		</dependency>
		<dependency>
			<groupId>org.unividuell</groupId>
			<artifactId>auth-spring-boot-starter</artifactId>
			<version>${unividuell-auth.version}</version>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-session-jdbc</artifactId>
		</dependency>
```

Run: `cd $COUNTDOWN/core && ./mvnw -B dependency:tree -Dincludes=org.unividuell:auth-spring-boot-starter | grep auth-spring-boot-starter`
Expected: `[INFO] \- org.unividuell:auth-spring-boot-starter:jar:0.1.0:compile`

- [ ] **Step 2: Die Tests schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/TestPrincipals.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core

import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.unividuell.auth.AuthPrincipal
import org.unividuell.countdown.core.iam.User
import java.util.UUID

/** Stable id for the authenticated test principal, so tests can assert against a fixed UUID. */
val TEST_USER_ID: UUID = UUID.fromString("018f0000-0000-7000-8000-000000000000")

/**
 * Authenticates a MockMvc request as [user], in the shape the auth lib's sign-in produces: an
 * [AuthPrincipal] whose roles are what the allowlist granted — SUPER_ADMIN exactly when the row is
 * flagged.
 */
fun principalFor(user: User): RequestPostProcessor {
    val principal = AuthPrincipal(
        id = requireNotNull(user.id) { "principalFor needs a saved user (id is null)" },
        provider = user.provider,
        login = user.githubLogin,
        roles = if (user.isSuperAdmin) setOf("SUPER_ADMIN") else emptySet(),
    )
    return authentication(OAuth2AuthenticationToken(principal, principal.authorities, user.provider))
}

/** For tests that care only about the role, not the user's other fields. */
fun principalFor(
    id: UUID = TEST_USER_ID,
    superAdmin: Boolean = false,
    githubLogin: String = "octocat",
) = principalFor(User(id = id, subject = "1", githubLogin = githubLogin, isSuperAdmin = superAdmin))
```

`core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProvisioningServiceTest.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.data.repository.findByIdOrNull
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.ExternalIdentity
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * The auth lib's hook against the real table: the upsert is SQL, which no mock exercises. The
 * values are ones no column default produces, so a write to the wrong column cannot pass.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserProvisioningServiceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    private fun github(subject: String, login: String, name: String? = null, email: String? = null) =
        ExternalIdentity(provider = "github", subject = subject, login = login, name = name, email = email)

    @Test
    fun `a first sign-in inserts the identity's row`() {
        val id = service.provision(
            identity = github(subject = "100", login = "octocat", name = "The Octocat", email = "cat@example.com"),
            roles = emptySet(),
        )

        id.version() shouldBe 7
        val user = repository.findByProviderAndSubject(provider = "github", subject = "100").shouldNotBeNull()
        user.id shouldBe id
        user.githubLogin shouldBe "octocat"
        user.githubName shouldBe "The Octocat"
        user.email shouldBe "cat@example.com"
        user.isSuperAdmin shouldBe false
        user.displayName.shouldBeNull()
        user.createdAt.shouldNotBeNull()
    }

    @Test
    fun `a later sign-in updates the provider's fields and keeps the user's own`() {
        val id = service.provision(
            identity = github(subject = "101", login = "old-login", name = "Old Name", email = "old@example.com"),
            roles = emptySet(),
        )
        val first = repository.findByIdOrNull(id).shouldNotBeNull()
        repository.save(first.copy(displayName = "Mr. Custom", bgColorHex = "#ff0000", communityCreationAllowed = true))

        val again = service.provision(
            identity = github(subject = "101", login = "new-login", name = "New Name", email = "new@example.com"),
            roles = setOf("SUPER_ADMIN"),
        )

        again shouldBe id
        val synced = repository.findByIdOrNull(id).shouldNotBeNull()
        synced.githubLogin shouldBe "new-login"
        synced.githubName shouldBe "New Name"
        synced.email shouldBe "new@example.com"
        synced.isSuperAdmin shouldBe true
        synced.displayName shouldBe "Mr. Custom"
        synced.bgColorHex shouldBe "#ff0000"
        synced.communityCreationAllowed shouldBe true
    }

    @Test
    fun `the super-admin flag follows the roles in both directions`() {
        val id = service.provision(identity = github(subject = "102", login = "boss"), roles = setOf("SUPER_ADMIN"))
        repository.findByIdOrNull(id).shouldNotBeNull().isSuperAdmin shouldBe true

        service.provision(identity = github(subject = "102", login = "boss"), roles = emptySet())
        repository.findByIdOrNull(id).shouldNotBeNull().isSuperAdmin shouldBe false
    }

    @Test
    fun `the same login at another provider is another account`() {
        val atGitHub = service.provision(identity = github(subject = "103", login = "hermes"), roles = emptySet())
        val asTestUser = service.provision(
            identity = ExternalIdentity(provider = "test", subject = "hermes", login = "hermes", name = null, email = null),
            roles = emptySet(),
        )

        asTestUser shouldNotBe atGitHub
    }

    @Test
    fun `a GitHub row from before the lib is found again by its numeric id`() {
        // iam/V3 turned github_id 123 into subject "123"; the lib maps GitHub's id 123 the same way.
        val migrated = repository.save(
            User(provider = "github", subject = "123", githubLogin = "octocat", displayName = "Kept"),
        )

        val id = service.provision(identity = github(subject = "123", login = "octocat-renamed"), roles = emptySet())

        id shouldBe migrated.id
        repository.findByIdOrNull(id).shouldNotBeNull().let {
            it.githubLogin shouldBe "octocat-renamed"
            it.displayName shouldBe "Kept"
        }
    }
}
```

`core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProvisioningServiceRaceTest.kt` vollständig ersetzen (der mockk-Test des alten Abfang-Wegs entfällt mit ihm):

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.auth.ExternalIdentity
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Two first sign-ins of one identity at once — two tabs, a double click. Not `@Transactional`:
 * both calls run on their own threads, each in its own transaction, as two requests would. Twenty
 * rounds, each with a subject of its own, deleted afterwards.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class UserProvisioningServiceRaceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `two concurrent first sign-ins of one identity make one row`() {
        val pool = Executors.newFixedThreadPool(2)
        try {
            repeat(20) { round ->
                val identity = ExternalIdentity(
                    provider = "github", subject = "race-$round", login = "racer", name = null, email = null,
                )
                val start = CyclicBarrier(2)

                val ids = List(2) {
                    pool.submit<UUID> {
                        start.await()
                        service.provision(identity = identity, roles = emptySet())
                    }
                }.map { it.get(10, TimeUnit.SECONDS) }

                ids.distinct() shouldHaveSize 1
                repository.deleteById(ids.first())
            }
        } finally {
            pool.shutdownNow()
        }
    }
}
```

`core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminRosterServiceTest.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminRosterService
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * Integration test on purpose: the roster runs hand-written SQL (`lower(github_login) IN (…)`, per
 * provider) and reads the real allowlist bean — neither is exercised by a mock. The list is spaced
 * like a hand-edited "a, b" value on purpose: `ghost` and `notyetflagged` must resolve without a
 * phantom " ghost" row.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(
    properties = [
        "unividuell.auth.roles.super-admin=github:bossuser, github:ghost, github:notyetflagged, github:prof, test:prof",
    ],
)
class SuperAdminRosterServiceTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `matches an allowlist entry to a differently-cased github login exactly once`() {
        users.save(User(subject = "501", githubLogin = "BossUser", displayName = "Boss", isSuperAdmin = true))

        val rows = service.roster().filter { it.githubLogin.lowercase() == "bossuser" }

        rows shouldHaveSize 1
        rows[0].provider shouldBe "github"
        rows[0].flagged shouldBe true
        rows[0].allowlisted shouldBe true
        rows[0].username shouldBe "Boss"
    }

    @Test
    fun `an allowlisted user stored with mixed-case login resolves to their real row instead of a phantom`() {
        // Unlike the differently-cased case above, this user is NOT flagged, so findSuperAdmins()
        // can't find them either — the only path to their real row is the lowercased SQL lookup.
        users.save(User(subject = "504", githubLogin = "NotYetFlagged"))

        val row = service.roster().single { it.githubLogin.lowercase() == "notyetflagged" }

        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldNotBeNull()
    }

    @Test
    fun `orders rows by lowercased github login`() {
        users.save(User(subject = "505", githubLogin = "Zulu", isSuperAdmin = true))
        users.save(User(subject = "506", githubLogin = "alpha", isSuperAdmin = true))

        val ownLogins = setOf("zulu", "alpha", "bossuser", "ghost", "notyetflagged")
        val logins = service.roster().map { it.githubLogin }.filter { it.lowercase() in ownLogins }

        logins shouldBe listOf("alpha", "bossuser", "ghost", "notyetflagged", "Zulu")
    }

    @Test
    fun `an allowlist entry without a user row awaits its first login`() {
        val row = service.roster().single { it.githubLogin == "ghost" }

        row.provider shouldBe "github"
        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldBeNull()
        row.createdAt.shouldBeNull()
        row.username.shouldBeNull()
    }

    @Test
    fun `whitespace left by a comma-separated allowlist value produces no phantom row`() {
        val logins = service.roster().map { it.githubLogin }

        logins shouldContain "ghost"
        logins shouldNotContain " ghost"
    }

    @Test
    fun `a flagged user missing from the allowlist is reported as stale`() {
        users.save(User(subject = "502", githubLogin = "removed", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "removed" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }

    @Test
    fun `the same login at two providers is two rows`() {
        users.save(User(provider = "test", subject = "prof", githubLogin = "prof", isSuperAdmin = true))

        val rows = service.roster().filter { it.githubLogin == "prof" }

        rows.map { it.provider } shouldBe listOf("github", "test")
        rows.single { it.provider == "test" }.let {
            it.flagged shouldBe true
            it.allowlisted shouldBe true
            it.userId.shouldNotBeNull()
        }
        rows.single { it.provider == "github" }.let {
            it.flagged shouldBe false
            it.allowlisted shouldBe true
            it.userId.shouldBeNull()
        }
    }

    @Test
    fun `a login listed for one provider does not cover the same login at another`() {
        users.save(User(provider = "test", subject = "bossuser", githubLogin = "bossuser", isSuperAdmin = true))

        val row = service.roster().single { it.provider == "test" && it.githubLogin == "bossuser" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}

/** Separate context: the empty default must not produce `IN ()`. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["unividuell.auth.roles.super-admin="])
class SuperAdminRosterEmptyAllowlistTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `an empty allowlist returns only flagged users`() {
        users.save(User(subject = "503", githubLogin = "onlyflagged", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "onlyflagged" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}
```

`core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminRosterControllerTest.kt` — ersetze

```kotlin
            SuperAdminUserResponse(
                githubLogin = "boss", username = "Boss", userId = uid,
```

durch

```kotlin
            SuperAdminUserResponse(
                provider = "github", githubLogin = "boss", username = "Boss", userId = uid,
```

ersetze

```kotlin
            SuperAdminUserResponse(
                githubLogin = "ghost", username = null, userId = null,
```

durch

```kotlin
            SuperAdminUserResponse(
                provider = "test", githubLogin = "ghost", username = null, userId = null,
```

und ersetze

```kotlin
                jsonPath("$[0].githubLogin") { value("boss") }
```

durch

```kotlin
                jsonPath("$[0].provider") { value("github") }
                jsonPath("$[0].githubLogin") { value("boss") }
                jsonPath("$[1].provider") { value("test") }
```

`core/src/test/kotlin/org/unividuell/countdown/core/iam/TestLoginEndToEndTest.kt` neu:

```kotlin
package org.unividuell.countdown.core.iam

import jakarta.servlet.http.Cookie
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
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * The auth lib's test door against countdown's own provisioning, database and session store — the
 * way localhost and staging sign in. `prof` is a super-admin by the test classpath's
 * `unividuell.auth.roles.super-admin`. Not `@Transactional`: a sign-in commits like the real one.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class TestLoginEndToEndTest(@Autowired val mockMvc: MockMvc) {

    /**
     * Signs in and hands back the session cookie. Not `request.session`: Spring Session wraps the
     * request, and the MvcResult only knows the unwrapped one.
     */
    private fun signInAs(login: String): Cookie {
        val header = mockMvc.post("/login/test/as") {
            with(csrf())
            param("login", login)
        }.andExpect {
            status { is3xxRedirection() }
        }.andReturn().response.getHeaders("Set-Cookie").single { it.startsWith("SESSION=") }

        return Cookie("SESSION", header.substringBefore(";").substringAfter("SESSION="))
    }

    @Test
    fun `GET login start renders the lib's picker`() {
        mockMvc.get("/login/start").andExpect {
            status { isOk() }
            content { string(containsString("""name="login" value="prof"""")) }
        }
    }

    @Test
    fun `prof signs in through the picker and is a super-admin`() {
        val session = signInAs(login = "prof")

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.githubLogin") { value("prof") }
            jsonPath("$.username") { value("Prof Farnsworth") }
            jsonPath("$.isSuperAdmin") { value(true) }
        }
        mockMvc.get("/api/super-admin/super-admins") { cookie(session) }.andExpect { status { isOk() } }
    }

    @Test
    fun `a test user outside the allowlist is no super-admin`() {
        val session = signInAs(login = "Fry")

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.isSuperAdmin") { value(false) }
        }
        mockMvc.get("/api/super-admin/super-admins") { cookie(session) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `switching players returns to the exact lab URL`() {
        // The lab's player switch: its URL carries `?` and `&`, and `{` once broke a redirect.
        val labUrl = "/c/team/lab/stub?seed=42&phase=TWO&note={x}"

        // get(URI) sends the escapes as they are; get(String) would encode them a second time.
        mockMvc.get(URI("/login/start?redirect=" + URLEncoder.encode(labUrl, StandardCharsets.UTF_8))).andExpect {
            status { isOk() }
            content { string(containsString("""name="redirect" value="/c/team/lab/stub?seed=42&amp;phase=TWO&amp;note={x}"""")) }
        }
        mockMvc.post("/login/test/as") {
            with(csrf())
            param("login", "Bender")
            param("redirect", labUrl)
        }.andExpect {
            redirectedUrl(labUrl)
        }
    }
}
```

`core/src/test/resources/application.yaml` — ersetze

```yaml
          github:
            client-id: test-client-id
```

durch

```yaml
          github:
            # Not a real client. It gives a context that switches the test login off a way in; the
            # auth lib refuses to start without one.
            client-id: test-client-id
```

und ersetze

```yaml
app:
  test-auth:
    enabled: true
  game-lab:
```

durch

```yaml
unividuell:
  auth:
    roles:
      # TestLoginEndToEndTest signs in as prof and expects a super-admin.
      super-admin: test:prof
    csrf-cookie:
      # Repeated from the main application.yaml, which this file replaces (PreviewControllerTest).
      excluded-paths: /api/preview/**

app:
  game-lab:
```

- [ ] **Step 3: Fehlschlag prüfen**

Run: `cd $COUNTDOWN/core && ./mvnw -q test -Dtest='UserProvisioningService*Test,SuperAdminRoster*Test,TestLoginEndToEndTest'`
Expected: FAIL beim Kompilieren der Tests — u. a. `No parameter with name 'identity' found` (`UserProvisioningServiceTest`, `UserProvisioningServiceRaceTest`) und `No parameter with name 'provider' found` (`SuperAdminRosterControllerTest`).

- [ ] **Step 4: Was in die Lib gezogen ist, löschen**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core
git rm -q -r \
  src/main/kotlin/org/unividuell/countdown/core/iam/internal/CsrfCookieFilter.kt \
  src/main/kotlin/org/unividuell/countdown/core/iam/internal/CountdownOAuth2User.kt \
  src/main/kotlin/org/unividuell/countdown/core/iam/internal/GitHubOAuth2UserService.kt \
  src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminProperties.kt \
  src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth \
  src/test/kotlin/org/unividuell/countdown/core/iam/CountdownOAuth2UserTest.kt \
  src/test/kotlin/org/unividuell/countdown/core/iam/GitHubOAuth2UserServiceTest.kt \
  src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminPropertiesTest.kt \
  src/test/kotlin/org/unividuell/countdown/core/iam/devauth
git status --short | grep '^D' | wc -l
```

Expected: `16` (4 + 4 Hauptdateien, 3 + 5 Tests).

- [ ] **Step 5: `typealias`, Erweiterung, Controller-Importe**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/AuthenticatedUser.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam

import org.unividuell.auth.AuthPrincipal

/**
 * The signed-in principal as other modules' controllers take it: the auth lib's session principal
 * (`id`, `provider`, `login`, `roles`). A snapshot from sign-in — read anything else live from the
 * row ([UserQuery]).
 */
typealias AuthenticatedUser = AuthPrincipal

/** Whether the allowlist (`unividuell.auth.roles.super-admin`) made this principal a super-admin at sign-in. */
val AuthPrincipal.isSuperAdmin: Boolean
    get() = "SUPER_ADMIN" in roles
```

Die acht Controller, die `me.isSuperAdmin` lesen, bekommen den Import der Erweiterung — hinter ihren letzten `iam`-Import (alphabetisch: Großbuchstaben vor `isSuperAdmin`):

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core/src/main/kotlin/org/unividuell/countdown/core
perl -0pi -e 's/((?:^import org\.unividuell\.countdown\.core\.iam\.\w+\n)+)/$1import org.unividuell.countdown.core.iam.isSuperAdmin\n/m' \
  community/internal/CommunityController.kt community/internal/MemberController.kt \
  community/internal/MemberProfileController.kt countdown/internal/CountdownController.kt \
  game/internal/RoundController.kt gamelab/internal/LabController.kt \
  imagepool/internal/ImagePoolController.kt imagepool/internal/SuperAdminImageController.kt
grep -c 'import org.unividuell.countdown.core.iam.isSuperAdmin' \
  community/internal/CommunityController.kt community/internal/MemberController.kt \
  community/internal/MemberProfileController.kt countdown/internal/CountdownController.kt \
  game/internal/RoundController.kt gamelab/internal/LabController.kt \
  imagepool/internal/ImagePoolController.kt imagepool/internal/SuperAdminImageController.kt
```

Expected: jede Datei `:1`. Beispiel `MemberController.kt` danach:

```kotlin
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.iam.isSuperAdmin
import java.util.UUID
```

`User.isSuperAdmin` (die Spalte, z. B. in `UserController`'s `toMeResponse`) ist eine andere Eigenschaft und bleibt, wie sie ist.

- [ ] **Step 6: Provisioner, Repository, Roster, `SecurityConfig`, `UserController`**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserRepository.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.iam.User
import java.util.UUID

interface UserRepository : CrudRepository<User, UUID> {
    fun findByProviderAndSubject(provider: String, subject: String): User?

    /**
     * One sign-in in one statement: inserts the identity's row, or updates the provider's fields and
     * the super-admin flag of the existing one. Two first sign-ins of one identity meet in the
     * unique key instead of in a `DuplicateKeyException`, which would abort the Postgres transaction
     * it ran in. The user's own fields (`display_name`, `bg_color_hex`, `community_creation_allowed`)
     * are never written. No `@Modifying`: the statement returns the row's id.
     */
    @Query(
        """
        INSERT INTO iam.users (provider, subject, github_login, github_name, email, is_super_admin)
        VALUES (:provider, :subject, :login, :name, :email, :isSuperAdmin)
        ON CONFLICT (provider, subject) DO UPDATE SET
            github_login = EXCLUDED.github_login,
            github_name = EXCLUDED.github_name,
            email = EXCLUDED.email,
            is_super_admin = EXCLUDED.is_super_admin,
            updated_at = now()
        RETURNING id
        """,
    )
    fun upsertIdentity(
        provider: String,
        subject: String,
        login: String,
        name: String?,
        email: String?,
        isSuperAdmin: Boolean,
    ): UUID

    /**
     * Explicit SQL rather than a derived `findByIsSuperAdminTrue()`: the property is already
     * named `isSuperAdmin`, and Spring Data strips a leading `Is` as a keyword, so the derived
     * name is ambiguous.
     */
    @Query("SELECT * FROM iam.users WHERE is_super_admin = true")
    fun findSuperAdmins(): List<User>

    /**
     * Lowercased match within one provider, because the allowlist grants the role per provider and
     * case-insensitively — `github:BossUser` must find a stored GitHub `bossuser`, never a test user
     * of that name. Never call with an empty collection: it renders `IN ()`, which is a SQL syntax
     * error.
     */
    @Query("SELECT * FROM iam.users WHERE provider = :provider AND lower(github_login) IN (:logins)")
    fun findByProviderAndGithubLoginLowercaseIn(provider: String, logins: Collection<String>): List<User>
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProvisioningService.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.AccountProvisioner
import org.unividuell.auth.ExternalIdentity
import java.util.UUID

/**
 * The auth lib's one hook: a real provider and the test login both end here. One account per
 * (provider, subject), never linked — not even by e-mail, which GitHub hands over unverified.
 */
@Service
class UserProvisioningService(private val repository: UserRepository) : AccountProvisioner {

    /** [roles] are what the allowlist grants right now; the stored flag follows them at every sign-in. */
    @Transactional
    override fun provision(identity: ExternalIdentity, roles: Set<String>): UUID =
        repository.upsertIdentity(
            provider = identity.provider,
            subject = identity.subject,
            login = identity.login,
            name = identity.name,
            email = identity.email,
            isSuperAdmin = "SUPER_ADMIN" in roles,
        )
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SuperAdminRosterService.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.RoleAllowlist
import org.unividuell.auth.RoleMember
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

/**
 * A super-admin as seen from both sources: `flagged` is the `is_super_admin` column,
 * `allowlisted` is membership in `unividuell.auth.roles.super-admin`. `username`, `userId` and
 * `createdAt` are null for an allowlist entry that has never logged in.
 */
data class SuperAdminUserResponse(
    val provider: String,
    val githubLogin: String,
    val username: String?,
    val userId: UUID?,
    val flagged: Boolean,
    val allowlisted: Boolean,
    val createdAt: Instant?,
)

/**
 * Who holds super-admin rights, from both sources — they drift by design. `is_super_admin` is
 * re-derived from the allowlist on every login, so someone newly allowlisted has no flag yet and
 * someone removed keeps it until their next sign-in. Reporting only one source would hide exactly
 * the state this endpoint exists to show, so rows carry both raw facts and the caller labels them.
 * A row is one provider plus one lowercased login: `github:prof` and `test:prof` are two people.
 */
@Service
class SuperAdminRosterService(
    private val users: UserRepository,
    private val roles: RoleAllowlist,
) {
    @Transactional(readOnly = true)
    fun roster(): List<SuperAdminUserResponse> {
        // RoleAllowlist hands its entries over trimmed, lowercased and without blanks.
        val allowlist = roles.members("SUPER_ADMIN").toSet()

        val flagged = users.findSuperAdmins()
        // One query per provider, each with a non-empty list: `IN ()` is a SQL syntax error.
        val allowlisted = allowlist
            .groupBy(keySelector = { it.provider }, valueTransform = { it.login })
            .flatMap { (provider, logins) ->
                users.findByProviderAndGithubLoginLowercaseIn(provider = provider, logins = logins)
            }

        val byMember = (flagged + allowlisted).associateBy { it.member() }
        val withoutUserRow = allowlist - byMember.keys

        return (
            byMember.map { (member, user) -> user.toRow(allowlisted = member in allowlist) } +
                withoutUserRow.map {
                    SuperAdminUserResponse(
                        provider = it.provider, githubLogin = it.login, username = null, userId = null,
                        flagged = false, allowlisted = true, createdAt = null,
                    )
                }
            ).sortedWith(compareBy<SuperAdminUserResponse>({ it.githubLogin.lowercase() }, { it.provider }))
    }

    /** This row in the allowlist's terms: provider and login, both lowercase. */
    private fun User.member() = RoleMember(provider = provider.lowercase(), login = githubLogin.lowercase())

    private fun User.toRow(allowlisted: Boolean) = SuperAdminUserResponse(
        provider = provider,
        githubLogin = githubLogin,
        username = username,
        userId = id,
        flagged = isSuperAdmin,
        allowlisted = allowlisted,
        createdAt = createdAt,
    )
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.web.SecurityFilterChain

/**
 * countdown's own access rules. Sign-in, the SPA contract (401 instead of a redirect, the CSRF
 * cookie, `POST /logout` answering 204) and the paths below `/login/` come from the auth lib, which
 * Spring Security applies to this chain before these rules. Lives in the `iam` module because
 * authentication is the only security concern today; revisit if other modules gain protected
 * resources.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PublicRateLimitProperties::class)
class SecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/actuator/health", permitAll)
                authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))
                // GET only: reading who invites you needs no session, accepting the invite does.
                authorize(method = HttpMethod.GET, pattern = "/api/communities/join/*", access = permitAll)
                // Open by design, not crawler-restricted here: the edge only forwards crawlers to
                // this path from the SPA routes, but the API path itself is reachable by anyone.
                // PublicRateLimitFilter brakes it, and every unresolvable code/slug answers with
                // the same generic page, so an open endpoint reveals nothing.
                authorize(method = HttpMethod.GET, pattern = "/api/preview/**", access = permitAll)
                authorize(anyRequest, authenticated)
            }
        }
        return http.build()
    }
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt` — ersetze

```kotlin
import org.unividuell.countdown.core.iam.Avatar
```

durch

```kotlin
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.Avatar
```

und ersetze die Klasse (von `@RestController` bis zum Dateiende)

```kotlin
@RestController
@RequestMapping("/api/me")
class UserController(private val profileService: UserProfileService) {

    @GetMapping
    fun me(@AuthenticationPrincipal principal: CountdownOAuth2User): MeResponse =
        profileService.current(principal.user.id!!).toMeResponse()

    @PatchMapping
    fun update(
        @AuthenticationPrincipal principal: CountdownOAuth2User,
        @RequestBody body: UpdateProfileRequest,
    ): MeResponse =
        profileService.update(
            userId = principal.user.id!!,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        ).toMeResponse()

    @PostMapping("/avatar-preview")
    fun avatarPreview(
        @AuthenticationPrincipal principal: CountdownOAuth2User,
        @RequestBody body: UpdateProfileRequest,
    ): AvatarPreviewResponse =
        profileService.preview(
            userId = principal.user.id!!,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        )
}
```

durch

```kotlin
@RestController
@RequestMapping("/api/me")
class UserController(private val profileService: UserProfileService) {

    @GetMapping
    fun me(@AuthenticationPrincipal principal: AuthenticatedUser): MeResponse =
        profileService.current(principal.id).toMeResponse()

    @PatchMapping
    fun update(
        @AuthenticationPrincipal principal: AuthenticatedUser,
        @RequestBody body: UpdateProfileRequest,
    ): MeResponse =
        profileService.update(
            userId = principal.id,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        ).toMeResponse()

    @PostMapping("/avatar-preview")
    fun avatarPreview(
        @AuthenticationPrincipal principal: AuthenticatedUser,
        @RequestBody body: UpdateProfileRequest,
    ): AvatarPreviewResponse =
        profileService.preview(
            userId = principal.id,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        )
}
```

- [ ] **Step 7: Die übrigen Test-Anpassungen**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/SuperAdminUserServiceTest.kt` — ersetze

```kotlin
/** `test-auth.enabled=false` keeps the seeded Futurama users out of this context (see SuperAdminRosterServiceTest). */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.test-auth.enabled=false"])
```

durch

```kotlin
/** The test login off: a context of its own, which no other class's committed users reach. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["unividuell.auth.test-login.enabled=false"])
```

`core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityCreationClearanceSeamTest.kt` — ersetze

```kotlin
 * `test-auth.enabled=false` keeps the seeded Futurama users out of the context.
```

durch

```kotlin
 * The test login is off: a context of its own, which no other class's committed users reach.
```

und ersetze

```kotlin
@TestPropertySource(properties = ["app.test-auth.enabled=false"])
```

durch

```kotlin
@TestPropertySource(properties = ["unividuell.auth.test-login.enabled=false"])
```

`core/src/test/kotlin/org/unividuell/countdown/core/TestcontainersConfiguration.kt` — ersetze

```kotlin
 * and migrates its own empty database. Sharing one database instead would not be safe —
 * `TestUserSeeder` commits its users at context startup, and the tests that switch it off do so
 * precisely to observe an empty table.
```

durch

```kotlin
 * and migrates its own empty database. Sharing one database instead would not be safe — a test
 * sign-in commits its user row, and the classes that run in a context of their own do so precisely
 * to observe a table no other class wrote to.
```

- [ ] **Step 8: Konfiguration**

`core/src/main/resources/application.yaml` — ersetze

```yaml
  modulith:
    runtime:
      flyway-enabled: true
  security:
    oauth2:
      client:
        registration:
          github:
            client-id: Ov23liQzcbT4kLUIXWoo
            # Local dev logs in through the seeded test-user picker (see app.test-auth),
            # which never performs a token exchange — so a placeholder keeps the documented
            # local flow running without exporting anything. Production overrides both this
            # and the client-id in application-production.yaml, where the secret has NO
            # default and a missing env var still fails the boot fast.
            client-secret: ${GITHUB_CLIENT_SECRET:local-dev-unused}
            scope: read:user
  session:
```

durch

```yaml
  modulith:
    runtime:
      flyway-enabled: true
  session:
```

ersetze

```yaml
      max-request-size: 16MB

app:
  super-admin-github-logins: ${SUPER_ADMIN_GITHUB_LOGINS:}
  guess-hue:
```

durch

```yaml
      max-request-size: 16MB

unividuell:
  auth:
    roles:
      # provider:login, comma-separated: test:<login> for a test user, github:<login> in production.
      # An entry without its provider prefix refuses to start; empty means nobody.
      super-admin: ${SUPER_ADMINS:}
    test-login:
      # The key that unlocks the test-user picker, once per browser profile. Empty means no lock —
      # allowed only while no profile is active, i.e. on localhost, where multi-user testing means
      # several browser profiles at once. The one place where env name and property path differ.
      # unividuell.auth.test-login.enabled=false replays the real GitHub flow (core/README.md).
      key: ${FAKE_SIGN_IN_KEY:}
    csrf-cookie:
      # Answered publicly cacheable to crawlers: a Set-Cookie there would defeat every shared cache.
      excluded-paths: /api/preview/**

app:
  guess-hue:
```

und ersetze

```yaml
    signing-secret: ${SPOT_OBJECT_SIGNING_SECRET:}
  test-auth:
    # Emulator-style test login (seeded users + picker). Default on for localhost.
    # Set false to replay the real prod GitHub OAuth flow locally (no seed, no picker).
    enabled: true
    # The key that unlocks the picker, once per browser profile. Empty means no lock — the
    # localhost default, because multi-user testing here means several browser profiles at once
    # and a lock would only cost typing. The variable is named after what the thing is called in
    # conversation; it is the one place in this file where env name and property path differ.
    key: ${FAKE_SIGN_IN_KEY:}
  game-lab:
    # The non-prod harness for playing a mini-game against a seed from the URL. Gated twice, like
    # test-auth: the beans are also @Profile("!production"). The switch exists so staging can be
```

durch

```yaml
    signing-secret: ${SPOT_OBJECT_SIGNING_SECRET:}
  game-lab:
    # The non-prod harness for playing a mini-game against a seed from the URL. Gated twice, like
    # the test login: the beans are also @Profile("!production"). The switch exists so staging can be
```

`core/src/main/resources/application-production.yaml` — ersetze

```yaml
          github:
            # Production GitHub OAuth App (callback https://countdown.unividuell.org/login/oauth2/code/github).
            # Public Client ID — safe to commit. The matching secret comes from ${GITHUB_CLIENT_SECRET}.
            client-id: Ov23lihx8kIQNB9e5Vz2
```

durch

```yaml
          github:
            # The organisation's GitHub App, shared by every unividuell app (up to ten callback URLs,
            # https://countdown.unividuell.org/login/oauth2/code/github among them). Public client
            # ID — safe to commit. The matching secret comes from ${GITHUB_CLIENT_SECRET}.
            client-id: Iv23liJTgm6EeJ6XshRh
```

und ersetze

```yaml
app:
  test-auth:
    enabled: false
  game-lab:
```

durch

```yaml
unividuell:
  auth:
    test-login:
      # Belt and braces: the auth lib never starts the test login under `production` anyway.
      enabled: false

app:
  game-lab:
```

`core/src/main/resources/application-staging.yaml` — ersetze

```yaml
app:
  test-auth:
    enabled: true
    # No default, unlike the base application.yaml: staging runs the real datasets on a public
    # URL. FakeSignInGate additionally refuses to start when this binds empty — Compose passes a
    # missing variable through as an empty string, which a bare `${...}` would not catch.
    key: ${FAKE_SIGN_IN_KEY}
  game-lab:
```

durch

```yaml
unividuell:
  auth:
    test-login:
      # No default, unlike the base application.yaml: staging runs the real datasets on a public
      # URL. The auth lib additionally refuses to start when this binds empty — Compose passes a
      # missing variable through as an empty string, which a bare `${...}` would not catch.
      key: ${FAKE_SIGN_IN_KEY}
app:
  game-lab:
```

`.claude/launch.json` — in der `backend`-Zeile ersetze

```
GITHUB_CLIENT_SECRET=unused-the-test-login-picker-does-no-token-exchange SUPER_ADMIN_GITHUB_LOGINS=bender ./mvnw spring-boot:run
```

durch

```
SUPER_ADMINS=test:bender ./mvnw spring-boot:run
```

`.run/CoreApplication.run.xml` — ersetze

```
    Nothing else has to be set: GITHUB_CLIENT_SECRET, SUPER_ADMIN_GITHUB_LOGINS and
    GUESS_HUE_DATASET_PATH all have defaults, and the app boots on the sample dataset with the
    test login picker. Add SUPER_ADMIN_GITHUB_LOGINS=<your github login> to this configuration's
    environment when you want super-admin, and see core/README.md for the real-dataset flow.
```

durch

```
    Nothing else has to be set: SUPER_ADMINS and GUESS_HUE_DATASET_PATH have defaults, and the
    app boots on the sample dataset with the test login picker. Add SUPER_ADMINS=test:bender to
    this configuration's environment when you want super-admin, and see core/README.md for the
    real-dataset flow.
```

- [ ] **Step 9: Fokussierte Tests**

Run: `cd $COUNTDOWN/core && ./mvnw -q clean test -Dtest='UserProvisioningService*Test,SuperAdminRoster*Test,TestLoginEndToEndTest,UserControllerTest,PreviewControllerTest'`
Expected: PASS, alle grün. `UserControllerTest` belegt 401, XSRF-Cookie und `POST /logout` → 204 jetzt aus der Lib; `PreviewControllerTest` das cookie-freie Preview.

- [ ] **Step 10: Gesamte Suite**

Run: `cd $COUNTDOWN/core && ./mvnw clean test`
Expected: `BUILD SUCCESS`, alle grün — `ModularityTests` eingeschlossen.

- [ ] **Step 11: Nichts Altes übrig**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
grep -rnE 'CountdownOAuth2User|GitHubOAuth2UserService|SuperAdminProperties|CsrfCookieFilter|devauth|DevLogin|FakeSignInGate|TestUserSeeder|GitHubLoginRedirect|test-auth|super-admin-github-logins|SUPER_ADMIN_GITHUB_LOGINS|findByGithubLogin|Ov23li' \
  core/src .claude/launch.json .run
```

Expected: keine Ausgabe.

- [ ] **Step 12: Die App einmal starten** — gegen ein Wegwerf-Postgres (siehe Entscheidung oben), Port `18080`, damit ein laufendes Backend nicht stört:

```bash
docker run -d --rm --name countdown-auth-boot -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=app -p 127.0.0.1:55432:5432 postgres:18
# The image starts Postgres twice (init, then for real); ready is the second announcement.
until [ "$(docker logs countdown-auth-boot 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ]; do sleep 1; done
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core
SUPER_ADMINS=test:bender ./mvnw -q spring-boot:run -Dspring-boot.run.arguments="--server.port=18080 --spring.docker.compose.enabled=false --spring.datasource.url=jdbc:postgresql://localhost:55432/app --spring.datasource.username=admin --spring.datasource.password=secret"
```

Im Hintergrund bzw. zweiten Terminal laufen lassen, warten auf `Started CoreApplicationKt`. Dann:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/login/start
curl -s http://localhost:18080/login/start | grep -c 'name="login"'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/login
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/api/me
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/oauth2/authorization/github
```

Expected, Zeile für Zeile: `200` (Picker), `12` (zwölf Test-User), `404` (das nackte `/login` gehört der SPA), `401`, `404` (lokal kein OAuth-Client, also keine Tür daran vorbei). Danach die App stoppen (Ctrl-C bzw. den Hintergrundprozess beenden); den Container für Step 13 stehen lassen.

- [ ] **Step 13: Fehlstart mit `SUPER_ADMINS` ohne Präfix** — der Wert, den die `.env`-Dateien heute unter dem alten Namen tragen:

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/core
SUPER_ADMINS=bender ./mvnw -q spring-boot:run -Dspring-boot.run.arguments="--server.port=18080 --spring.docker.compose.enabled=false --spring.datasource.url=jdbc:postgresql://localhost:55432/app --spring.datasource.username=admin --spring.datasource.password=secret" \
  2>&1 | grep -m1 -o "'bender' lacks the provider prefix.*"
docker stop countdown-auth-boot
```

Expected: `'bender' lacks the provider prefix — write it as provider:login, e.g. github:octocat`; der Start bricht von selbst ab.

- [ ] **Step 14: Commit**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
git add -A core .claude/launch.json .run
git status --short
git commit -F - <<'EOF'
Sign in through the auth lib

Sign-in, the test-user picker and its lock, and the SPA security setup
now come from org.unividuell:auth-spring-boot-starter; countdown keeps
its account table and its own access rules. UserProvisioningService is
the lib's AccountProvisioner, one INSERT ... ON CONFLICT per sign-in:
the old catch-and-refetch could never recover, because a unique
violation aborts the Postgres transaction it ran in. Test users are
provisioned on their first pick instead of seeded at start. SUPER_ADMINS
lists provider:login entries, and the roster keys its rows by provider,
since github:prof and test:prof are two people.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

`git status --short` vor dem Commit zeigt nur Dateien aus der Liste oben (keine `target/`-Reste, keine Dateien außerhalb von `core/`, `.claude/launch.json`, `.run/`).

---

### Task 5: Frontend — `/login/start`

Der eine Login-Knopf und „Spieler wechseln“ zeigen auf den neuen Einstieg. Dev-Proxy und Edge leiten `/login/*` schon ans Backend und bleiben funktional unverändert; nur Kommentare, die `/login/github` nennen, ziehen nach. Das Roster braucht nichts: `provider` ist ein zusätzliches JSON-Feld, das die Seite ignoriert.

**Entscheidung:** Für „Spieler wechseln“ entsteht eine eigene Spec `src/gamelab/__tests__/lab-controls.spec.ts` (Dateiname nach der Konvention des Ordners). Bisher prüft nur `lab-page.spec.ts` den `redirect`-Wert des Links, nicht seinen Pfad, und nicht mit `&` und `{`.

**Files:**
- Modify: `webapp-vue/src/auth/useAuth.ts`, `webapp-vue/src/gamelab/LabControls.vue`, `webapp-vue/dev-proxy.ts` (Kommentar), `webapp-vue/src/api/types.ts` (Kommentar)
- Modify (Tests): `webapp-vue/src/auth/__tests__/useAuth.spec.ts`, `webapp-vue/src/pages/__tests__/login.spec.ts`, `webapp-vue/src/auth/__tests__/postLoginRedirect.spec.ts`, `webapp-vue/src/__tests__/dev-proxy.spec.ts`
- Create (Test): `webapp-vue/src/gamelab/__tests__/lab-controls.spec.ts`

**Interfaces:**
- Consumes: Backend `GET /login/start[?redirect=…]` (Task 1, Task 4).
- Produces: `useAuth().loginWithGitHub()` navigiert nach `/login/start`; der Link `data-test="lab-switch-player"` zeigt auf `` `/login/start?redirect=${encodeURIComponent(props.returnPath)}` ``.

- [ ] **Step 1: Specs umstellen und die neue schreiben**

`src/auth/__tests__/useAuth.spec.ts` und `src/pages/__tests__/login.spec.ts` — jeweils ersetze

```ts
    expect(assign).toHaveBeenCalledWith('/login/github')
```

durch

```ts
    expect(assign).toHaveBeenCalledWith('/login/start')
```

`src/auth/__tests__/postLoginRedirect.spec.ts` — ersetze

```ts
    for (const p of ['/', '/login', '/login/github', '//evil.example', 'https://evil.example']) {
```

durch

```ts
    for (const p of ['/', '/login', '/login/start', '//evil.example', 'https://evil.example']) {
```

`src/__tests__/dev-proxy.spec.ts` — ersetze

```ts
    '/login/github',
    '/login/github/as',
    '/login/oauth2/code/github',
```

durch

```ts
    '/login/start',
    '/login/test/as',
    '/login/test/unlock',
    '/login/oauth2/code/github',
```

`src/gamelab/__tests__/lab-controls.spec.ts` neu:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LabControls from '@/gamelab/LabControls.vue'

describe('LabControls', () => {
  it('sends "Spieler wechseln" through the sign-in picker and back to the exact lab URL', () => {
    // `?` and `&` belong to the lab URL itself; `{` once broke the server-side redirect.
    const returnPath = '/c/team/lab/stub?seed=42&phase=TWO&note={x}'
    const wrapper = mount(LabControls, {
      props: { seed: 42, phase: 'TWO', returnPath, busy: false },
    })

    const href = wrapper.get('[data-test="lab-switch-player"]').attributes('href')
    const url = new URL(href!, 'https://example.test')

    expect(url.pathname).toBe('/login/start')
    expect(url.searchParams.get('redirect')).toBe(returnPath)
  })
})
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd $COUNTDOWN/webapp-vue && pnpm test`
Expected: FAIL, drei Tests — `useAuth.spec.ts` und `login.spec.ts` mit `expected "spy" to be called with arguments: [ '/login/start' ]` (erhalten `'/login/github'`), `lab-controls.spec.ts` mit `expected '/login/github' to be '/login/start'`. `dev-proxy.spec.ts` und `postLoginRedirect.spec.ts` sind schon grün (Präfix `/login/` bzw. `/login*`).

- [ ] **Step 3: Implementieren**

`src/auth/useAuth.ts` — ersetze

```ts
    window.location.assign('/login/github')
```

durch

```ts
    window.location.assign('/login/start')
```

`src/gamelab/LabControls.vue` — ersetze

```vue
    :href="`/login/github?redirect=${encodeURIComponent(props.returnPath)}`"
```

durch

```vue
    :href="`/login/start?redirect=${encodeURIComponent(props.returnPath)}`"
```

`dev-proxy.ts` — ersetze

```ts
 * only its sub-paths (/login/github, /login/oauth2/code/*) are backend. Without the slash a
 * direct load of http://localhost:5173/login is proxied away and never reaches the router.
```

durch

```ts
 * only its sub-paths (/login/start, /login/test/*, /login/oauth2/code/*) are backend. Without
 * the slash a direct load of http://localhost:5173/login is proxied away and never reaches the
 * router.
```

`src/api/types.ts` — ersetze

```ts
 * SUPER_ADMIN_GITHUB_LOGINS. They drift because the flag is re-derived on every login.
```

durch

```ts
 * SUPER_ADMINS. They drift because the flag is re-derived on every login.
```

- [ ] **Step 4: Tests, Lint, Typecheck**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01/webapp-vue
pnpm test
pnpm lint
pnpm typecheck
grep -rn 'login/github' src dev-proxy.ts
```

Expected: alle Tests grün; `lint` und `typecheck` (`vue-tsc -b`) ohne Fehler; der Grep ohne Ausgabe.

- [ ] **Step 5: Commit**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
git add webapp-vue
git commit -F - <<'EOF'
Point the SPA's sign-in at /login/start

The auth lib answers under /login/start and leaves the bare /login to
the SPA's own sign-in page. The lab's player switch carries its URL
through the picker as before, query string and all.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Deploy, READMEs, Guidelines

Betreiber- und Entwickler-Doku auf die Lib und `SUPER_ADMINS`; die Guidelines behalten countdowns eigene Regeln und verweisen für den Rest auf das README der Lib ([feeding-knowledge-back.md](../../../.claude/guidelines/feeding-knowledge-back.md)). Neue Regeln: keine Session für anonyme Requests; ein Upsert ist `ON CONFLICT`, nie „fangen und neu lesen“; ein Backfill wird mit Flyway bis `V(n-1)` plus echten Zeilen getestet.

**Entscheidung:** `.env.staging.example` behält `GITHUB_CLIENT_SECRET` als leere Zeile, `deploy/compose.yaml` reicht die Variable unverändert durch. Gesetzt-aber-leer hält Compose auf staging still; den Wert liest dort nichts mehr.

**Entscheidung:** Der lokale echte GitHub-Login (`core/README.md`) reicht das Secret per Umgebungsvariable `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_CLIENTSECRET` herein, nicht als Startargument: so steht es nicht in der Prozessliste, und Maven bekommt kein `${…}` in `-Dspring-boot.run.arguments` zu interpolieren. Exportiert wird weiterhin nur `GITHUB_CLIENT_SECRET`, in der Shell.

**Files:**
- Modify: `deploy/compose.yaml`, `deploy/.env.prod.example`, `deploy/.env.staging.example`, `deploy/README.md`, `deploy/Caddyfile` (Kommentar)
- Modify: `core/README.md`
- Modify: `.claude/guidelines/security-and-auth.md` (neu geschrieben), `testing.md`, `persistence.md`, `logging.md`, `frontend.md`, `game-lab.md`, `deployment.md`, `deployment-edge.md`, `dependency-updates.md`, `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1–5.
- Produces: Doku; kein Code.

- [ ] **Step 1: `deploy/`**

`deploy/compose.yaml` — ersetze

```yaml
      - SUPER_ADMIN_GITHUB_LOGINS=${SUPER_ADMIN_GITHUB_LOGINS:-}
```

durch

```yaml
      - SUPER_ADMINS=${SUPER_ADMINS:-}
```

`deploy/.env.prod.example` — ersetze

```
GITHUB_CLIENT_SECRET=change-me
# comma-separated real GitHub logins granted the super-admin role; empty = nobody has it
SUPER_ADMIN_GITHUB_LOGINS=
```

durch

```
# the GitHub App's client secret (its client ID is committed in application-production.yaml)
GITHUB_CLIENT_SECRET=change-me
# comma-separated github:<login> entries granted the super-admin role; empty = nobody has it.
# An entry without the github: prefix makes the backend refuse to start.
SUPER_ADMINS=
```

`deploy/.env.staging.example` — ersetze

```
# staging logs in via the test-user picker; GitHub OAuth is configured-but-unused → placeholder ok
GITHUB_CLIENT_SECRET=unused
# grants a seed user (bender) the super-admin role, so /api/super-admin is exercisable on staging
# — same seed login the localhost setup uses; matching is case-insensitive, so this hits seed "Bender"
SUPER_ADMIN_GITHUB_LOGINS=bender
```

durch

```
# Staging has no OAuth client: the backend refuses a test-login key next to one. Empty on purpose.
GITHUB_CLIENT_SECRET=
# grants a test user (bender) the super-admin role, so /api/super-admin is exercisable on staging
# — the same test user the localhost setup uses; matching is case-insensitive, so this hits "Bender"
SUPER_ADMINS=test:bender
```

`deploy/Caddyfile` — in der Kommentarzeile über `@backend` (Tab-eingerückt) ersetze die Teilzeichenkette

```
(/login/github, /login/oauth2/code/*)
```

durch

```
(/login/start, /login/test/*, /login/oauth2/code/*)
```

`deploy/README.md` — ersetze

```markdown
- A production GitHub OAuth App (callback `https://countdown.unividuell.org/login/oauth2/code/github`);
  its Client ID is committed in `application-production.yaml`, its secret goes into `.env.prod` as `GITHUB_CLIENT_SECRET`.
  Staging does not use a real GitHub OAuth App (`GITHUB_CLIENT_SECRET=unused`); login is via the built-in test-user picker.
- `SUPER_ADMIN_GITHUB_LOGINS` in `.env.prod`/`.env.staging` grants the app-level super-admin role
  (`/api/super-admin/...`) to a comma-separated list of GitHub logins. Leave it empty and nobody
  has the role.
```

durch

```markdown
- The organisation's GitHub App (`https://countdown.unividuell.org/login/oauth2/code/github` among its
  redirect URIs); its client ID is committed in `application-production.yaml`, its client secret goes
  into `.env.prod` as `GITHUB_CLIENT_SECRET`. Staging has no OAuth client at all — the backend refuses
  a test-login key next to one; login there is via the built-in test-user picker.
- `SUPER_ADMINS` in `.env.prod`/`.env.staging` grants the app-level super-admin role
  (`/api/super-admin/...`) to a comma-separated list of `provider:login` entries — `github:<login>`
  in prod, `test:<login>` on staging. An entry without its prefix makes the backend refuse to start;
  leave it empty and nobody has the role.
```

ersetze

```markdown
`.env.prod` needs nothing; the picker does not exist in production.

**Migrating an existing stack for Weltanschauung:**
```

durch

```markdown
`.env.prod` needs nothing; the picker does not exist in production.

**Migrating an existing stack for the auth lib:** before the release reaches the stack, edit
`.env.<target>` by hand: rename `SUPER_ADMIN_GITHUB_LOGINS` to `SUPER_ADMINS` and prefix every
entry — `github:<login>` in prod, `test:<login>` on staging. An unprefixed entry makes the backend
refuse to start; a missing variable leaves nobody super-admin. In `.env.prod`, set
`GITHUB_CLIENT_SECRET` to the GitHub App's client secret. The first start clears every session:
users sign in once more, and staging testers re-enter the key (the lock's cookie has a new name).

**Migrating an existing stack for Weltanschauung:**
```

ersetze

```
# edit .env.prod: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, SUPER_ADMIN_GITHUB_LOGINS,
```

durch

```
# edit .env.prod: POSTGRES_PASSWORD, GITHUB_CLIENT_SECRET, SUPER_ADMINS (github:<login>),
```

ersetze

```
#   GITHUB_CLIENT_SECRET=unused is fine
#   (SUPER_ADMIN_GITHUB_LOGINS=bender comes from the template on this first run — see note above for existing stacks)
```

durch

```
#   GITHUB_CLIENT_SECRET stays empty (staging has no OAuth client)
#   (SUPER_ADMINS=test:bender comes from the template on this first run — see note above for existing stacks)
```

und ersetze

```markdown
Visit `beta.countdown.unividuell.org` → click Login → pick a test user. The test-user picker
is served by the backend at `/login/github` when `SPRING_PROFILES_ACTIVE=staging`.
```

durch

```markdown
Visit `beta.countdown.unividuell.org` → click Login → enter the key once per browser
(`FAKE_SIGN_IN_KEY`) → pick a test user. The picker is the auth lib's, served by the backend at
`/login/start` when `SPRING_PROFILES_ACTIVE=staging`.
```

- [ ] **Step 2: `core/README.md`** — den Abschnitt von `## Running locally` (Zeile 1) bis vor `## Guess Hue: checking the dataset` vollständig ersetzen durch:

````markdown
## Running locally

The default local setup needs **no OAuth client and no credentials** — it signs in through the
auth lib's test-user picker (see step 3). Use the GitHub App only to replay the production login
locally (see "Real GitHub login" below).

1. Start Postgres + the app, granting a test user super-admin in the same command:
   ```bash
   cd core && SUPER_ADMINS=test:bender ./mvnw spring-boot:run
   ```
   Spring Boot's docker-compose support brings up `compose.yaml` from the repo root
   (Postgres 18 + pgAdmin). It finds it via `spring.docker.compose.file: ../compose.yaml`
   in `application.yaml`, because the file sits one level above this module.

   **From IntelliJ:** use the shared *CoreApplication* configuration (`.run/` at the repo root)
   rather than the one the IDE offers to generate. The only thing it does differently is set the
   working directory to `core/`, and that is the whole difference between booting and
   `'files' content [../compose.yaml] must exist` — an IDE run configuration starts in the project
   root, where `../compose.yaml` points above the repo. Add `SUPER_ADMINS` to its
   environment for the same effect as the command above.

   The variable has to be on the start command, not exported afterwards:
   `unividuell.auth.roles.super-admin` is bound when the context starts, so a running app never
   picks it up. Its value is a comma-separated list of `provider:login` entries granted
   `ROLE_SUPER_ADMIN`; an entry without its provider prefix refuses to start.

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
   no test user carries the clearance, and the only way to grant it is the super-admin area
   (`/super-admin/users`) — which needs a super-admin. So without this step every
   `POST /api/communities` answers `403`.
   With the test-login picker on (the default), the value must name a test user from step 3
   with the `test:` prefix — not your own GitHub login. Matching is case-insensitive, so
   `test:bender` finds `Bender`.
   `.claude/launch.json`'s `backend` configuration already sets `SUPER_ADMINS=test:bender`,
   so starting from there needs none of this.
   The ranking row on a community home starts at all zeros and fills up as members play rounds —
   there is no stand-in for game points any more, in no environment.
3. Sign in at `http://localhost:8080/login/start` — the picker offers twelve Futurama test users
   (`Fry`, `leela`, `Bender`, `prof`, `amy`, `hermes`, `zoidberg`, `scruffy`, `zapp`,
   `kif`, `nibbler`, `mom`); a test user's row is created the first time it is picked. Afterwards
   `GET /api/me` returns the provisioned user (or `401` when not signed in). Pick the user from
   step 2 to get the super-admin, then clear any other test user for community creation under
   `/super-admin/users` — the clearance is read live, so it takes effect without a re-login. A
   test user is listed there only after its first sign-in.

When developing against the `webapp-vue` SPA (the normal setup), start the SPA too and use
`http://localhost:5173` instead — Vite proxies `/api`, `/oauth2`, `/login` and `/logout` to
this backend. See `webapp-vue/README.md`.

### Real GitHub login

To exercise the production login instead of the picker, sign in through the organisation's GitHub
App. Its redirect URIs already include `http://localhost:5173/login/oauth2/code/github` (through
the SPA) and `http://localhost:8080/login/oauth2/code/github` (the backend alone). Its client
secret is the production one: keep it in this shell only, never in a file.

```bash
export GITHUB_CLIENT_SECRET=…   # the GitHub App's client secret
cd core && SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_CLIENTSECRET="$GITHUB_CLIENT_SECRET" ./mvnw spring-boot:run \
  -Dspring-boot.run.arguments="--spring.security.oauth2.client.registration.github.client-id=Iv23liJTgm6EeJ6XshRh --unividuell.auth.test-login.enabled=false"
```

The secret goes in as an environment variable rather than a start argument, so it stays out of
the process list. With the test login off, `/login/start` sends you on to GitHub.

````

- [ ] **Step 3: `.claude/guidelines/security-and-auth.md`** — vollständig ersetzen:

````markdown
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
healthcheck. The lib keeps its own paths session-free; countdown's code is countdown's job.

## SPA contract — countdown's side

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
````

- [ ] **Step 4: Die übrigen Guidelines**

`.claude/guidelines/testing.md` — ersetze

```
result.shouldBeInstanceOf<CountdownOAuth2User>()  // io.kotest.matchers.types.*
```

durch

```
result.shouldBeInstanceOf<AuthPrincipal>()  // io.kotest.matchers.types.*
```

ersetze

```markdown
`mockk<UserRepository>()`, `every { repo.findByGithubId(42L) } returnsMany listOf(null, existing)`,
`every { repo.save(match { it.id == null }) } throws DuplicateKeyException("dup")`,
`verify(exactly = 2) { repo.findByGithubId(42L) }`. Prefer mockk over hand-rolled fakes.
```

durch

```markdown
`mockk<UserRepository>()`,
`every { repo.findByProviderAndSubject(provider = "github", subject = "42") } returnsMany listOf(null, existing)`,
`every { repo.save(match { it.id == null }) } throws DuplicateKeyException("dup")`,
`verify(exactly = 2) { repo.findByProviderAndSubject(provider = "github", subject = "42") }`. Prefer
mockk over hand-rolled fakes.
```

ersetze

````markdown
mockMvc.get("/api/me") {
    with(authentication(OAuth2AuthenticationToken(principal, principal.authorities, "github")))
}.andExpect {
````

durch

````markdown
mockMvc.get("/api/me") {
    with(principalFor(user))
}.andExpect {
````

ersetze

```
    with(authentication(...)); with(csrf())
```

durch

```
    with(principalFor(user)); with(csrf())
```

ersetze

````markdown
## Test isolation
````

durch

````markdown
`principalFor` (`TestPrincipals.kt`) builds the auth lib's `AuthPrincipal` for a `User` — role
`SUPER_ADMIN` exactly when the row is flagged; `principalFor(superAdmin = true)` when only the role
matters. Don't build tokens by hand. To go through the real test door instead, `POST /login/test/as`
and carry the `SESSION` cookie from its `Set-Cookie` header — not `request.session`: Spring Session
wraps the request, and the `MvcResult` knows only the unwrapped one (`TestLoginEndToEndTest`).

## Test isolation
````

ersetze

````markdown
`app.test-auth.enabled` is `true` on the test classpath, so **`TestUserSeeder` seeds its twelve
Futurama users into every `@SpringBootTest` context** — rows `@Transactional` cannot roll back,
because they are committed before the test starts. Any test asserting *exact* membership over all
users (a full `list()`, a `count()`, a roster) must switch the seeder off:

```kotlin
@TestPropertySource(properties = ["app.test-auth.enabled=false"])
```

`SuperAdminRosterServiceTest` and `SuperAdminUserServiceTest` are the precedents.
````

durch

````markdown
No users are seeded. A test user's row appears when a test signs in through the lib's
`POST /login/test/as`, and it is committed — `@Transactional` cannot roll back what a request
wrote. Any test asserting *exact* membership over all users (a full `list()`, a `count()`) runs in
a context of its own, which also keeps the test door shut there:

```kotlin
@TestPropertySource(properties = ["unividuell.auth.test-login.enabled=false"])
```

`SuperAdminUserServiceTest` is the precedent. The test classpath registers a placeholder GitHub
client so that such a context still has a way in; the lib refuses to start without one.
````

und ersetze

```markdown
still starts from an empty, freshly migrated database. Don't collapse that to one shared database:
`TestUserSeeder` commits before any test runs, and the classes that set
`app.test-auth.enabled=false` do so precisely to observe an empty table.
```

durch

```markdown
still starts from an empty, freshly migrated database. Don't collapse that to one shared database:
test sign-ins commit their rows, and the classes that switch the test login off do so precisely to
observe a table no other class wrote to.
```

`.claude/guidelines/persistence.md` — ersetze

```kotlin
    @Id val id: UUID? = null,
    val githubId: Long,
    val githubLogin: String,
```

durch

```kotlin
    @Id val id: UUID? = null,
    val provider: String,
    val subject: String,
    val githubLogin: String,
```

ersetze

```markdown
Two things the test suite cannot tell you, because Flyway runs before any row exists in a
Testcontainers database:

- **A backfill copies zero rows in tests.** Verify it against real rows — a disposable
  `postgres:18` container, the migrations applied in order, a couple of seeded rows, then an
  `IS DISTINCT FROM` check between old and new. Never against the developer's own dev database,
  and never with `docker compose down -v`.
```

durch

```markdown
Two things a Spring test cannot tell you, because Flyway runs before any row exists in its
database:

- **A backfill copies zero rows in a Spring test.** Verify it against real rows in a plain test:
  run the module's Flyway up to the previous version, insert rows, migrate the rest, assert
  (`IdentityMigrationTest`). With that test, one migration needs no expand/switch/contract split
  for testability. Never against the developer's own dev database, and never with
  `docker compose down -v`.
```

ersetze

```markdown
For "create-or-update on each login" style flows: look up by the natural key,
`.copy(...)` only the fields you own, and guard the insert race with a
`UNIQUE` constraint + `catch (e: DuplicateKeyException) { re-fetch and sync }`.
Throw a diagnosable `IllegalStateException(..., e)` if the re-fetch unexpectedly
misses — never a bare `!!`.
```

durch

```markdown
For "create-or-update on each login" style flows: one statement,
`INSERT … ON CONFLICT (natural key) DO UPDATE SET <only the fields you own> … RETURNING id`
(`UserRepository.upsertIdentity`). Never look up, insert and `catch (e: DuplicateKeyException)` to
re-fetch: a unique violation aborts the Postgres transaction it ran in, so the re-fetch fails too.
[game-rounds.md](game-rounds.md) has the `DO NOTHING` twin.
```

und ersetze

```markdown
query returns — not assumed from the query result. `DevLoginController` iterates `seedUsers` (the
in-code, declared order) and looks each one up in a map built from
`findByGithubLoginIn(seeder.seedLogins)`, rather than iterating the query result directly, for
exactly this reason.
```

durch

```markdown
query returns — not assumed from the query result.
```

`.claude/guidelines/logging.md` — ersetze

````markdown
@Controller
class DevLoginController(/* … */) {

    private val logger = KotlinLogging.logger {}

    fun picker(): String {
        logger.warn { "no database row for seed login '$login' — omitting its button" }
    }
}
````

durch

````markdown
@Service
class CountdownService(/* … */) {

    private val logger = KotlinLogging.logger {}

    fun forSlug(/* … */): CountdownResponse {
        logger.warn { "community $communityId has no active edition — countdown shows no date" }
    }
}
````

ersetze

```markdown
  file with two top-level declarations (`SeedUser` + `TestUserSeeder` in `TestUserSeeder.kt`) would
```

durch

```markdown
  file with two top-level declarations (`MeResponse` + `UserController` in `UserController.kt`) would
```

und ersetze

```markdown
Prefer a log line where behaviour degrades **silently**. The case that motivated this: the dev-login
picker drops the button of a seed user whose database row is missing — one button short beats a
broken page, but an absent button with no log line is close to undiagnosable. Name the identifier
that went missing, so the line points at the cause rather than announcing that something happened.
```

durch

```markdown
Prefer a log line where behaviour degrades **silently**. Example: a community without an active
edition gets a countdown without a date — a page short of one fact beats a 500, but a missing date
with no log line is close to undiagnosable. Name the identifier that went missing, so the line
points at the cause rather than announcing that something happened.
```

`.claude/guidelines/frontend.md` — in der `useAuth`-Zeile ersetze die Teilzeichenkette

```
`window.location.assign('/login/github')` (the server redirects on to `/oauth2/authorization/github` or the test-user picker, by profile
```

durch

```
`window.location.assign('/login/start')` (the auth lib shows the test-user picker or redirects on to `/oauth2/authorization/github`, by profile
```

in der Dev-Proxy-Zeile ersetze

```
only its sub-paths (`/login/github`, `/login/oauth2/code/*`) are backend.
```

durch

```
only its sub-paths (`/login/start`, `/login/test/*`, `/login/oauth2/code/*`) are backend.
```

und ersetze

```
The **GitHub OAuth App callback must be the SPA origin** in dev: `http://localhost:5173/login/oauth2/code/github`.
```

durch

```
The **GitHub App lists the SPA origin's callback** for dev: `http://localhost:5173/login/oauth2/code/github`.
```

`.claude/guidelines/game-lab.md` — ersetze

```
Second instance after the test-user picker — from here it is the convention. Every bean of a
```

durch

```
Second instance after the test-user picker (now the auth lib's) — from here it is the convention. Every bean of a
```

`.claude/guidelines/deployment.md` — ersetze

```markdown
  `SUPER_ADMIN_GITHUB_LOGINS`). When adding one, document a one-line manual-migration note in
```

durch

```markdown
  `SUPER_ADMINS`). When adding one, document a one-line manual-migration note in
```

und ersetze

```markdown
- `application-production.yaml` (profile `production`): GitHub **client-id committed** (public),
  **client-secret via env**; explicit datasource to the compose `postgres` service;
```

durch

```markdown
- `application-production.yaml` (profile `production`): the GitHub App's **client-id committed**
  (public), **client-secret via env**; explicit datasource to the compose `postgres` service;
```

`.claude/guidelines/deployment-edge.md` — ersetze

```markdown
  `beta.countdown.unividuell.org` → `countdown-staging-web:80` (staging logs in via the test-user
  picker — see [security-and-auth.md](security-and-auth.md); there is no separate staging GitHub
  OAuth App).
```

durch

```markdown
  `beta.countdown.unividuell.org` → `countdown-staging-web:80` (staging logs in via the test-user
  picker and has no OAuth client at all — see [security-and-auth.md](security-and-auth.md)).
```

und ersetze

```markdown
Serve the SPA with HTML5 history-mode fallback and reverse-proxy `/api`, `/oauth2`, `/login`
(incl. `/login/github`) and `/logout` to `core:8080`.
```

durch

```markdown
Serve the SPA with HTML5 history-mode fallback and reverse-proxy `/api`, `/oauth2`, the paths below
`/login/` (`/login/start`, `/login/test/*`, the OAuth callback) and `/logout` to `core:8080`.
```

`.claude/guidelines/dependency-updates.md` — ersetze

```markdown
  are ours: the parent, `kotlin.version`, `spring-modulith.version`, `kotlin-logging.version`,
  `metadata-extractor.version`, `twelvemonkeys.version`, and the four test deps (`kotest`,
  `mockk`, `springmockk`).
```

durch

```markdown
  are ours: the parent, `kotlin.version`, `spring-modulith.version`, `kotlin-logging.version`,
  `metadata-extractor.version`, `twelvemonkeys.version`, `unividuell-auth.version` (below), and the
  four test deps (`kotest`, `mockk`, `springmockk`).
```

und ersetze

```markdown
- Gate: **`./mvnw -B clean verify`** (full suite incl. Testcontainers + `ModularityTests`).
```

durch

```markdown
- Gate: **`./mvnw -B clean verify`** (full suite incl. Testcontainers + `ModularityTests`).
- **`unividuell-auth.version` is the auth lib, which is not on Maven Central.** Bump it by
  releasing [`unividuell/auth-spring-boot-starter`](https://github.com/unividuell/auth-spring-boot-starter)
  and deploying into `core/maven-repo/` (its README, "Releasing"), then commit that directory with
  the new version. The plugin only knows what `core/maven-repo/` already holds.
```

`.claude/guidelines/README.md` — ersetze

```markdown
| Security & auth — backend (GitHub OAuth2 · session · roles · SPA contract · browser vs. server API keys) | [security-and-auth.md](security-and-auth.md) |
```

durch

```markdown
| Security & auth — backend (auth lib · one account per provider · no session for anonymous requests · roles · browser vs. server API keys) | [security-and-auth.md](security-and-auth.md) |
```

`CLAUDE.md` — ersetze

```markdown
- **[Security & auth](.claude/guidelines/security-and-auth.md)** — GitHub OAuth2, session, super-admin role, SPA 401/CSRF contract, browser vs. server API keys. *(backend)*
```

durch

```markdown
- **[Security & auth](.claude/guidelines/security-and-auth.md)** — sign-in via the auth lib (`org.unividuell:auth-spring-boot-starter`), one account per provider, no session for anonymous requests, super-admin role, browser vs. server API keys. *(backend)*
```

- [ ] **Step 5: Nichts Altes übrig**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
grep -rnE 'devauth|DevLogin|FakeSignInGate|TestUserSeeder|CountdownOAuth2User|GitHubOAuth2UserService|SuperAdminProperties|CsrfCookieFilter|SUPER_ADMIN_GITHUB_LOGINS|super-admin-github-logins|test-auth|/login/github|githubId|Ov23li' . \
  --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=maven-repo --exclude-dir=.superpowers --exclude-dir=.idea \
  | grep -v '^./docs/superpowers/'
```

Expected: genau ein Treffer — die Migrationsnotiz, die den alten Namen nennen muss:

```
./deploy/README.md:…:`.env.<target>` by hand: rename `SUPER_ADMIN_GITHUB_LOGINS` to `SUPER_ADMINS` and prefix every
```

Run: `cd $COUNTDOWN/core && ./mvnw -q test -Dtest=ModularityTests && cd ../webapp-vue && pnpm lint`
Expected: beides ohne Fehler (Doku-Task; ein Smoke-Check, dass nichts Code berührt hat).

- [ ] **Step 6: Commit**

```bash
cd /opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/dazzling-bardeen-d62b01
git add CLAUDE.md .claude/guidelines core/README.md deploy
git commit -F - <<'EOF'
Document the auth lib for operators and authors

deploy/ and the READMEs name SUPER_ADMINS with its provider prefix and
the GitHub App; the guidelines keep countdown's own rules and point to
the lib's README for the rest. New rules: no session for an anonymous
request, an upsert is one ON CONFLICT statement, and a backfill is
tested by migrating real rows from the previous version.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Von Hand und Auslieferung

Kein Task — Prüfungen und Schritte, die der User (bzw. der Koordinator nach seinem OK) selbst macht.

**Lokal, vor dem PR:**

- [ ] Prüfen, aus welchem Checkout Backend und Frontend laufen (`.claude/launch.json` des Worktrees, nicht des Hauptcheckouts) — beide Annahmen haben schon Arbeit gekostet.
- [ ] Achtung: Der erste lokale Start migriert die **geteilte** Dev-Datenbank (`compose.yaml` heißt fest `countdown`) auf `iam/V3` und leert ihre Sessions. Ein Checkout auf `develop` kann danach ihre Nutzer nicht mehr lesen (`github_id` fehlt), bis dieser Branch gelandet ist.
- [ ] Backend (`launch.json` → `backend`, setzt `SUPER_ADMINS=test:bender`) und Frontend starten, `http://localhost:5173/login` öffnen — die SPA-Seite erscheint, nicht das Backend. „Login with GitHub“ → Picker unter `/login/start` → `Bender` → `/super-admin` erreichbar.
- [ ] Lab: eine Community anlegen (als Bender), `/c/<slug>/lab/sample?seed=42&phase=TWO` öffnen, im Drawer „Spieler wechseln“ → Picker → `Fry` → zurück auf genau dieser URL, Seed und Phase erhalten.
- [ ] Logout → zurück auf `/login`; ein Reload bleibt abgemeldet.
- [ ] Echter GitHub-Login über die GitHub App: Backend stoppen, nach `core/README.md`, „Real GitHub login“ starten (Client-ID `Iv23liJTgm6EeJ6XshRh`, `GITHUB_CLIENT_SECRET` nur in der Shell, `--unividuell.auth.test-login.enabled=false`), über `http://localhost:5173` anmelden → Zustimmungsseite der App → zurück auf `/`, `/api/me` zeigt den eigenen GitHub-Login; in `iam.users` steht die Zeile mit `provider = 'github'` und der numerischen GitHub-ID als `subject`.

**Lib veröffentlichen (Koordinator, nach OK des Users):**

- [ ] `git -C /opt/unividuell/projects/auth-spring-boot-starter push origin main v0.1.0` — `main` mit „Release 0.1.0“ und „Start 0.2.0-SNAPSHOT“, dazu der Tag.

**staging — vor dem Merge des PR nach `develop`:**

- [ ] In der staging-`.env` auf dem Server `SUPER_ADMIN_GITHUB_LOGINS=bender` durch `SUPER_ADMINS=test:bender` ersetzen (weitere Test-User nach Bedarf, z. B. `test:bender,test:prof`). `FAKE_SIGN_IN_KEY` bleibt unverändert. **Ein Eintrag ohne `test:`-Präfix lässt das Backend nicht starten** (Fail-fast der Lib); fehlt die Variable, ist niemand Super-Admin.
- [ ] PR nach `develop` (`gh pr create --base develop`), mergen; CI baut `:staging`; `./update.sh staging`.
- [ ] `beta.countdown.unividuell.org`: alle sind abgemeldet (Sessions geleert); Login → Schloss (Schlüssel einmal neu eingeben, das Cookie heißt jetzt anders) → Picker → `Bender` ist Super-Admin (`/super-admin`), `prof` nur, wenn eingetragen. Ein Blick ins Roster: die Einträge tragen `provider: test`.

**prod — vor dem Release nach `main`:**

- [ ] `iam.users` ansehen: `docker compose --env-file .env.prod -f compose.prod.yaml exec postgres psql -U admin -d app -c 'SELECT id, github_id, github_login FROM iam.users'` → genau die eine echte Zeile, `github_id` positiv, keine negative.
- [ ] In der Prod-`.env`: `SUPER_ADMINS=github:<login>` (statt `SUPER_ADMIN_GITHUB_LOGINS`) und `GITHUB_CLIENT_SECRET` = Secret der GitHub App. Ohne `github:`-Präfix startet das Backend nicht.
- [ ] Release `develop` → `main`, `./update.sh prod`.

**prod — danach:**

- [ ] Echter Login auf `countdown.unividuell.org` → Zustimmungsseite der GitHub App → angemeldet, Super-Admin; dieselbe Zeile wie vorher (`provider = 'github'`, `subject` = alte `github_id`), keine zweite.
- [ ] Die beiden alten OAuth Apps löschen: Prod `Ov23lihx…`, Dev `Ov23liQz…`.

**Bekannte Grenze, nicht Teil dieses Plans:** Die Super-Admin-Seite rendert das Roster mit `:key="u.githubLogin"` (`webapp-vue/src/pages/super-admin/index.vue`). Steht derselbe Login bei zwei Providern in einer Umgebung (`github:prof` und `test:prof`), bekommt Vue zwei gleiche Keys. Auf staging (`test:` only) und in Prod (`github:` only) kommt das nicht vor.
