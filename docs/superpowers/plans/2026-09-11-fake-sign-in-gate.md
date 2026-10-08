# Schlüssel vor dem Fake-Login — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der seeded Fake-Login auf staging lässt nur durch, wer einen Zugangsschlüssel eingetippt hat; lokal bleibt er offen.

**Architecture:** Eine Komponente `FakeSignInGate` in `iam/internal/devauth` kennt den konfigurierten Schlüssel, prüft ein Langzeit-Cookie und verweigert den Start, wenn unter `staging` kein Schlüssel gesetzt ist. `DevLoginController` fragt sie an seinen zwei bestehenden Türen und bekommt eine dritte Route zum Einlösen des Schlüssels. Kein Frontend-Anteil, keine Migration.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Security 7 · JUnit 5 + kotest-Matcher + MockMvc-Kotlin-DSL + Testcontainers

**Spec:** [`docs/superpowers/specs/2026-09-11-fake-sign-in-gate-design.md`](../specs/2026-09-11-fake-sign-in-gate-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare in Code und Config, `deploy/README.md` und Commit-Messages sind **englisch**. Dieses Plandokument und die Spec sind deutsch. Nutzertexte im gerenderten HTML sind deutsch und nutzen `„…“`, nie `"`.
- **Commit-Messages:** Betreff imperativ, ≤50 Zeichen, Großbuchstabe am Anfang, kein Punkt am Ende; Leerzeile; Body auf 72 Zeichen umbrochen, erklärt *was und warum*. Jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Test-Stack:** kotest-Matcher (`shouldBe`, `shouldContain`, `shouldNotContain`, `shouldThrow`), JUnit 5 als Runner, MockMvc-**Kotlin-DSL** (`mockMvc.get(...) { }.andExpect { }`). Niemals `kotlin.test`, JUnit-Assertions, Mockito oder `MockMvcRequestBuilders`.
- **TDD:** Test zuerst, scheitern sehen, minimal implementieren, bestehen sehen, committen.
- **Named Arguments:** ab zwei Argumenten am Aufrufort, außer bei Varargs, Java-Funktionen, Trailing-Lambdas und Infix.
- **Kommentardichte:** kurze Kommentare, die *was* und *warum* erklären; keine Tombstone-Kommentare an Code, den man nicht angefasst hat.
- **Property-Name:** `app.test-auth.key`, gespeist aus der Umgebungsvariablen `FAKE_SIGN_IN_KEY`. Die Abweichung ist beabsichtigt und in der Spec begründet — nicht „korrigieren“.
- **Cookie-Name:** `countdown_fake_sign_in`. **Cookie-Wert:** SHA-256-Hex des Schlüssels, nie der Schlüssel.
- **Kommandos:** `cd core && ./mvnw test` (volle Suite, braucht Docker), einzelne Klasse mit `./mvnw test -Dtest=KlassenName`.

## Dateien

**Neu:**

| Datei | Verantwortung |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/FakeSignInGate.kt` | Schlüssel lesen und normalisieren, Cookie prüfen und setzen, Start unter `staging` ohne Schlüssel verweigern |
| `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/FakeSignInGateTest.kt` | Unit-Tests der Komponente, ohne Spring-Kontext |
| `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginLockedTest.kt` | MockMvc-Tests mit gesetztem Schlüssel |

**Geändert:**

| Datei | Änderung |
|---|---|
| `core/src/main/kotlin/.../iam/internal/devauth/DevLoginController.kt` | gemeinsame `page()`-Hülle, gesperrter Bildschirm, `POST /login/github/unlock`, Gate vor `loginAs` |
| `core/src/main/resources/application.yaml` | `app.test-auth.key: ${FAKE_SIGN_IN_KEY:}` |
| `core/src/main/resources/application-staging.yaml` | `app.test-auth.key: ${FAKE_SIGN_IN_KEY}` |
| `deploy/compose.yaml` | `FAKE_SIGN_IN_KEY` an `core` durchreichen |
| `deploy/.env.staging.example` | neue Variable mit Erklärung |
| `deploy/README.md` | Variable in den beiden Listen und im Migrationsabsatz |
| `.claude/guidelines/security-and-auth.md` | Abschnitt zum Schloss inkl. der offenen OAuth-Flanke |

**Unverändert, aber betroffen:** `core/src/test/resources/application.yaml` setzt `app.test-auth.key` **nicht** — der Schlüssel bleibt im Test leer, alle bestehenden `devauth`-Tests laufen weiter gegen den offenen Picker. Das ist beabsichtigt und wird nicht angefasst.

**Eine Abweichung von der Spec:** Sie listet „Profil `staging` + leerer Schlüssel → der Kontext startet nicht“ als Integrationstest. Der Plan prüft dieselbe Logik als Unit-Test auf den Konstruktor von `FakeSignInGate` (Task 1). Ein `@ActiveProfiles("staging")`-Kontext müsste sonst die ganze staging-YAML erfüllen — Datasource, drei `SPOT_OBJECT_*`-Werte ohne Default — um am Ende genau den einen `check` zu beweisen, den der Konstruktor direkt hergibt.

---

### Task 1: Die Gate-Komponente

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/FakeSignInGate.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/FakeSignInGateTest.kt`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces:
  - `class FakeSignInGate(rawKey: String, environment: Environment)`
  - `fun isOpen(request: HttpServletRequest): Boolean`
  - `fun accepts(candidate: String): Boolean`
  - `fun unlock(request: HttpServletRequest, response: HttpServletResponse)`
  - `companion object { const val COOKIE_NAME = "countdown_fake_sign_in" }`

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/FakeSignInGateTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam.devauth

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.unividuell.countdown.core.iam.internal.devauth.FakeSignInGate

class FakeSignInGateTest {

    private val localEnvironment = MockEnvironment()
    private val stagingEnvironment = MockEnvironment().apply { setActiveProfiles("staging") }

    private fun gate(key: String, environment: MockEnvironment = localEnvironment) =
        FakeSignInGate(rawKey = key, environment = environment)

    @Test
    fun `an empty key is no lock at all`() {
        // The localhost default: multi-user testing means many browser profiles, and a lock
        // there would only cost typing.
        gate(key = "").isOpen(MockHttpServletRequest()) shouldBe true
        gate(key = "   ").isOpen(MockHttpServletRequest()) shouldBe true
    }

    @Test
    fun `a configured key locks a request without the cookie`() {
        gate(key = "open-sesame").isOpen(MockHttpServletRequest()) shouldBe false
    }

    @Test
    fun `a request carrying the cookie the gate itself issued is open`() {
        val gate = gate(key = "open-sesame")
        val response = MockHttpServletResponse()
        gate.unlock(request = MockHttpServletRequest(), response = response)

        val issued = response.getHeader("Set-Cookie")!!.substringAfter("=").substringBefore(";")
        val request = MockHttpServletRequest().apply {
            setCookies(Cookie(FakeSignInGate.COOKIE_NAME, issued))
        }

        gate.isOpen(request) shouldBe true
    }

    @Test
    fun `a cookie from a different key stays locked`() {
        val other = MockHttpServletResponse()
        gate(key = "another-key").unlock(request = MockHttpServletRequest(), response = other)
        val foreign = other.getHeader("Set-Cookie")!!.substringAfter("=").substringBefore(";")

        val request = MockHttpServletRequest().apply {
            setCookies(Cookie(FakeSignInGate.COOKIE_NAME, foreign))
        }

        gate(key = "open-sesame").isOpen(request) shouldBe false
    }

    @Test
    fun `the cookie carries the hash, never the key itself`() {
        // HttpOnly keeps JavaScript out, not the DevTools cookie panel — and screenshots travel.
        val response = MockHttpServletResponse()
        gate(key = "open-sesame").unlock(request = MockHttpServletRequest(), response = response)

        response.getHeader("Set-Cookie")!! shouldNotContain "open-sesame"
    }

    @Test
    fun `the cookie is scoped, long-lived and not readable by scripts`() {
        val response = MockHttpServletResponse()
        gate(key = "open-sesame").unlock(request = MockHttpServletRequest(), response = response)

        val header = response.getHeader("Set-Cookie")!!
        header.contains("Path=/login") shouldBe true
        header.contains("HttpOnly") shouldBe true
        header.contains("SameSite=Lax") shouldBe true
        header.contains("Max-Age=31536000") shouldBe true
        // MockHttpServletRequest is plain HTTP, so the Secure flag must be absent here — it is
        // driven by the request, not hard-coded, or localhost over http could never unlock.
        header.contains("Secure") shouldBe false
    }

    @Test
    fun `a secure request gets a secure cookie`() {
        val response = MockHttpServletResponse()
        val request = MockHttpServletRequest().apply { isSecure = true }
        gate(key = "open-sesame").unlock(request = request, response = response)

        response.getHeader("Set-Cookie")!!.contains("Secure") shouldBe true
    }

    @Test
    fun `accepts the configured key and nothing else`() {
        val gate = gate(key = "open-sesame")

        gate.accepts("open-sesame") shouldBe true
        gate.accepts("  open-sesame  ") shouldBe true
        gate.accepts("open-sesam") shouldBe false
        gate.accepts("") shouldBe false
    }

    @Test
    fun `without a key everything is accepted`() {
        gate(key = "").accepts("whatever") shouldBe true
    }

    @Test
    fun `staging refuses to start without a key`() {
        // Compose hands a missing variable through as an empty string, not as an error. Without
        // this check beta would stand open and look healthy doing it.
        val thrown = shouldThrow<IllegalStateException> {
            gate(key = "", environment = stagingEnvironment)
        }
        thrown.message!!.contains("FAKE_SIGN_IN_KEY") shouldBe true
    }

    @Test
    fun `staging starts with a key`() {
        gate(key = "open-sesame", environment = stagingEnvironment)
            .isOpen(MockHttpServletRequest()) shouldBe false
    }
}
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd core && ./mvnw test -Dtest=FakeSignInGateTest
```

Erwartet: Übersetzungsfehler — `FakeSignInGate` existiert nicht (`unresolved reference`).

- [ ] **Step 3: Write the component**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/FakeSignInGate.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal.devauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.security.MessageDigest
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Component

/**
 * The lock in front of the fake sign-in. Staging runs the real datasets on a public URL, so the
 * picker — the only door into staging — asks for a key once per browser profile.
 *
 * Gated like everything in `devauth`: profile plus flag. With the fake sign-in switched off there
 * is nothing to lock, which is why the lock disappears with it.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class FakeSignInGate(
    @Value("\${app.test-auth.key:}") rawKey: String,
    environment: Environment,
) {
    /** Trimmed and blank-folded once, here: "no key" must mean the same thing to every caller. */
    private val key: String? = rawKey.trim().ifBlank { null }

    /** What a browser must present. Never the key itself — see [unlock]. */
    private val expected: String? = key?.let(::sha256Hex)

    init {
        val locked = environment.activeProfiles.filter { it in LOCKED_PROFILES }
        check(key != null || locked.isEmpty()) {
            "app.test-auth.key is empty under profile(s) ${locked.joinToString()} — set FAKE_SIGN_IN_KEY. " +
                "Refusing to start: Compose passes a missing variable through as an empty string, so an " +
                "unlocked fake sign-in would hand out every round's solution and look healthy doing it."
        }
    }

    /** No key configured means no lock — the localhost default. */
    fun isOpen(request: HttpServletRequest): Boolean {
        val expected = expected ?: return true
        val presented = request.cookies?.firstOrNull { it.name == COOKIE_NAME }?.value ?: return false
        return constantTimeEquals(presented, expected)
    }

    /** Whether a typed-in candidate is the configured key. Compared as hashes, so equal length. */
    fun accepts(candidate: String): Boolean {
        val expected = expected ?: return true
        return constantTimeEquals(sha256Hex(candidate.trim()), expected)
    }

    /**
     * Issues the cookie. It holds the key's **hash**: `HttpOnly` keeps JavaScript out but not the
     * DevTools cookie panel, and a development machine's screenshots travel. Against a stolen
     * cookie this does nothing — that opens the door either way; it protects the key, not the door.
     *
     * `Path=/login` because nowhere else reads it, so nowhere else should carry it. `Secure` comes
     * from the request (correct behind `forward-headers-strategy: framework`), or plain-HTTP
     * localhost could never unlock at all.
     */
    fun unlock(request: HttpServletRequest, response: HttpServletResponse) {
        val value = expected ?: return
        val cookie = ResponseCookie.from(COOKIE_NAME, value)
            .path("/login")
            .httpOnly(true)
            .secure(request.isSecure)
            .sameSite("Lax")
            .maxAge(Duration.ofDays(365))
            .build()

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString())
    }

    private fun constantTimeEquals(a: String, b: String) =
        MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))

    private fun sha256Hex(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString(separator = "") { "%02x".format(it) }

    companion object {
        const val COOKIE_NAME = "countdown_fake_sign_in"

        /**
         * `production` is deliberately absent: the fake sign-in does not exist there at all
         * (`@Profile("!production")`). A line that can never fire would claim a protection it
         * does not provide.
         */
        private val LOCKED_PROFILES = setOf("staging")
    }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd core && ./mvnw test -Dtest=FakeSignInGateTest
```

Erwartet: alle zehn Tests grün.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/FakeSignInGate.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/FakeSignInGateTest.kt
git commit -F - <<'EOF'
Add the lock that guards the fake sign-in

Staging deliberately runs the real datasets on a public URL, so the seeded
picker -- the only door into staging -- needs a key. The component holds
the whole mechanism: normalise the configured key once, compare a
browser's cookie against its hash, issue that cookie.

The cookie carries the hash rather than the key because HttpOnly keeps
JavaScript out but not the DevTools cookie panel, and screenshots from a
development machine travel further than the machine does.

Startup fails under staging with no key: Compose passes a missing variable
through as an empty string, so the alternative is beta standing open while
looking perfectly healthy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Gesperrter Bildschirm und Einlöse-Route

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginLockedTest.kt`

**Interfaces:**
- Consumes: `FakeSignInGate.isOpen(request)`, `FakeSignInGate.accepts(candidate)`, `FakeSignInGate.unlock(request, response)`, `FakeSignInGate.COOKIE_NAME` aus Task 1.
- Produces: `POST /login/github/unlock` mit den Formularfeldern `key`, `redirect`, `_csrf`; `GET /login/github` rendert bei geschlossenem Gate den gesperrten Bildschirm.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginLockedTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam.devauth

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.devauth.FakeSignInGate

/**
 * The locked half of the picker. Every other `devauth` test runs with no key configured — the
 * localhost default — so this class is the only place the lock is actually shut.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["app.test-auth.key=open-sesame"])
@Transactional
class DevLoginLockedTest(@Autowired val mockMvc: MockMvc) {

    /**
     * Unlocks once and hands back the cookie the gate issued, for reuse in a later request.
     * Parsed out of the raw header rather than read via `response.getCookie(...)`: the gate writes
     * a `Set-Cookie` header (ResponseCookie), and whether MockHttpServletResponse also
     * materialises that as a Cookie object is framework behaviour this test should not depend on.
     */
    private fun unlockedCookie(): Cookie {
        val header = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "open-sesame")
        }.andReturn().response.getHeader("Set-Cookie").shouldNotBeNull()

        val value = header.substringBefore(";").substringAfter("${FakeSignInGate.COOKIE_NAME}=")
        return Cookie(FakeSignInGate.COOKIE_NAME, value)
    }

    @Test
    fun `without the cookie the picker is replaced by the locked screen`() {
        val html = mockMvc.get("/login/github").andExpect {
            status { isOk() }
            content { contentType("text/html;charset=UTF-8") }
        }.andReturn().response.contentAsString

        html shouldContain "Gesperrt"
        // A locked door that lists the names behind it shows what there is to take.
        html shouldNotContain "leela"
        html shouldNotContain "Turanga"
        html shouldNotContain """name="login""""
    }

    @Test
    fun `the locked screen declares a mobile viewport`() {
        // Same expectation as the picker: without it phones lay out at ~980px and scale down.
        mockMvc.get("/login/github").andExpect {
            content { string(org.hamcrest.Matchers.containsString("""<meta name="viewport" content="width=device-width,initial-scale=1">""")) }
        }
    }

    @Test
    fun `a wrong key changes nothing`() {
        val response = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "guessing")
        }.andExpect {
            status { isOk() }
        }.andReturn().response

        response.getHeader("Set-Cookie").shouldBeNull()
        response.contentAsString shouldContain "Falscher Schlüssel"
        // No hint about what the right one looks like.
        response.contentAsString shouldNotContain "open-sesame"
    }

    @Test
    fun `the right key issues the cookie and returns to the picker`() {
        val response = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "open-sesame")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login/github")
        }.andReturn().response

        val header = response.getHeader("Set-Cookie").shouldNotBeNull()
        header shouldContain "${FakeSignInGate.COOKIE_NAME}="
        header shouldNotContain "open-sesame"
    }

    @Test
    fun `with the cookie the picker renders as usual`() {
        val html = mockMvc.get("/login/github") {
            cookie(unlockedCookie())
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        html shouldContain """name="login" value="leela""""
    }

    @Test
    fun `unlocking carries the redirect through to the picker`() {
        // Post/Redirect/Get: the destination must survive the round-trip, or a deep link is lost
        // at exactly the moment the key is entered.
        mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "open-sesame")
            param("redirect", "/c/team/lab/sample?seed=42")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login/github?redirect=%2Fc%2Fteam%2Flab%2Fsample%3Fseed%3D42")
        }
    }

    @Test
    fun `the locked screen escapes a redirect containing markup`() {
        // The value is echoed into a hidden field; unescaped it is an XSS hole on the one page
        // that is reachable without any credential at all.
        mockMvc.get("""/login/github?redirect=/x"><script>alert(1)</script>""").andExpect {
            status { isOk() }
            content { string(org.hamcrest.Matchers.containsString("&lt;script&gt;")) }
        }
    }

    @Test
    fun `a wrong key keeps the redirect for the next attempt`() {
        val html = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "guessing")
            param("redirect", "/c/team/lab/sample?seed=42")
        }.andReturn().response.contentAsString

        html shouldContain """name="redirect" value="/c/team/lab/sample?seed=42""""
    }
}
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd core && ./mvnw test -Dtest=DevLoginLockedTest
```

Erwartet: FAIL — `GET /login/github` liefert weiterhin den Picker („Gesperrt“ fehlt), `POST /login/github/unlock` antwortet 404.

- [ ] **Step 3: Extract the shared page shell**

In `DevLoginController.kt` die heutige `picker`-Methode so umbauen, dass Hülle und Stylesheet einmal existieren. Die HTML-Hülle samt `<style>` wandert aus `picker` in eine private `page`-Funktion; der Stil bekommt zwei Ergänzungen für das Eingabefeld und die Fehlerzeile:

```kotlin
    /**
     * The shell both server-rendered pages share. Two copies of one stylesheet drift, and both
     * pages need the viewport meta — without it phones lay out at their ~980px desktop fallback
     * and scale the result down, which reads as a CSS bug and is not one.
     */
    private fun page(title: String, body: String): String =
        """<!doctype html><html lang="de"><head><meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>$title</title>
          <style>
            :root{color-scheme:light dark;--bg:#fafaf9;--card:#fff;--border:#e7e5e4;--fg:#1c1917;--hover:#f5f5f4}
            @media (prefers-color-scheme:dark){
              :root{--bg:#1c1917;--card:#292524;--border:#44403c;--fg:#fafaf9;--hover:#44403c}
            }
            *{box-sizing:border-box}
            body{margin:0;padding:1.5rem 1rem;min-height:100dvh;display:flex;align-items:center;justify-content:center;
                 font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
            .card{width:100%;max-width:22rem;background:var(--card);border:1px solid var(--border);
                  border-radius:12px;padding:1.25rem}
            h1{font-size:1.125rem;font-weight:600;margin:0 0 1rem}
            p{margin:0 0 1rem}
            form{margin:0 0 .5rem}
            form:last-of-type{margin-bottom:0}
            button{display:flex;align-items:center;gap:.75rem;width:100%;min-height:44px;padding:.5rem .75rem;
                   border:1px solid var(--border);border-radius:8px;background:transparent;color:inherit;
                   font:inherit;text-align:left;cursor:pointer}
            button:hover{background:var(--hover)}
            input[type=password]{width:100%;min-height:44px;padding:.5rem .75rem;margin:0 0 .5rem;
                   border:1px solid var(--border);border-radius:8px;background:transparent;color:inherit;font:inherit}
            .error{color:#dc2626;font-size:.9375rem}
            .chip{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;
                  background:#e7e5e4;font-size:15px;line-height:1}
          </style></head>
          <body><div class="card">$body</div></body></html>"""
```

Das Ende von `picker` wird damit zu:

```kotlin
        return page(title = "Test-Login", body = """<h1>Test-Login</h1>$buttons""")
```

- [ ] **Step 4: Add the locked screen and the unlock route**

Gate in den Konstruktor von `DevLoginController` aufnehmen:

```kotlin
class DevLoginController(
    private val users: UserRepository,
    private val seeder: TestUserSeeder,
    private val gate: FakeSignInGate,
) {
```

In `picker` als erste Anweisung nach dem Lesen des CSRF-Tokens:

```kotlin
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken

        // The picker is the only door into staging, and staging runs the real datasets.
        if (!gate.isOpen(request)) return lockedPage(csrf = csrf, redirect = redirect, wrongKey = false)
```

Danach die beiden neuen Elemente in derselben Klasse:

```kotlin
    /**
     * The locked screen IS the keyhole — there is no state in which you learn that you are locked
     * out without also seeing where the key goes. It lists no seed logins: a locked door that
     * names what is behind it shows what there is to take.
     */
    private fun lockedPage(csrf: CsrfToken, redirect: String?, wrongKey: Boolean): String {
        val error = if (wrongKey) """<p class="error">Falscher Schlüssel.</p>""" else ""
        return page(
            title = "Gesperrt",
            body = """<h1>Gesperrt</h1>
              <p>Diese Umgebung ist nicht öffentlich.</p>
              $error
              <form method="post" action="/login/github/unlock">
                <input type="hidden" name="_csrf" value="${csrf.token}"/>
                <input type="hidden" name="redirect" value="${HtmlUtils.htmlEscape(redirect ?: "")}"/>
                <input type="password" name="key" autocomplete="current-password" autofocus required
                       aria-label="Zugangsschlüssel" placeholder="Zugangsschlüssel"/>
                <button type="submit"><span>Freischalten</span></button>
              </form>""",
        )
    }

    /**
     * Post/Redirect/Get on success: the browser lands back on the picker by URL, so a reload does
     * not re-post the key. A wrong key renders the locked screen again instead of redirecting,
     * which keeps the attempt out of the address bar and the key out of the access log.
     */
    @PostMapping("/login/github/unlock", produces = ["text/html;charset=UTF-8"])
    @ResponseBody
    fun unlock(
        @RequestParam key: String,
        @RequestParam(required = false) redirect: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<String> {
        if (!gate.accepts(key)) {
            val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
            return ResponseEntity.ok(lockedPage(csrf = csrf, redirect = redirect, wrongKey = true))
        }

        gate.unlock(request = request, response = response)

        // URLEncoder, not UriComponentsBuilder: the latter reads "{...}" as a template variable,
        // and a brace in a redirect path is legitimate here (see safeRedirect's own note).
        val target = if (redirect.isNullOrBlank()) {
            "/login/github"
        } else {
            "/login/github?redirect=" + URLEncoder.encode(redirect, StandardCharsets.UTF_8)
        }

        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, target).build()
    }
```

Nötige Importe in `DevLoginController.kt`:

```kotlin
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
```

- [ ] **Step 5: Run the new test and the existing ones together**

```bash
cd core && ./mvnw test -Dtest='DevLoginLockedTest,DevLoginControllerTest'
```

Erwartet: beide Klassen grün. `DevLoginControllerTest` läuft ohne Schlüssel und muss unverändert bestehen — es ist der Beweis, dass lokal nichts kaputtgegangen ist.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginLockedTest.kt
git commit -F - <<'EOF'
Put a keyhole where the picker used to be

With a key configured, the picker renders a locked screen instead of the
test users, and a form beside it takes the key. Locked screen and keyhole
are the same page on purpose: there is no state in which you learn that
you are locked out without also seeing where the key goes.

It lists no seed logins. A locked door that names what is behind it shows
what there is to take -- and those names are committed, so the list would
be a working shortlist rather than a hint.

A wrong key re-renders instead of redirecting, which keeps the attempt out
of the address bar and out of the edge's access log.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Die zweite Tür

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt` (`loginAs`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginLockedTest.kt` (ergänzen)

**Interfaces:**
- Consumes: `FakeSignInGate.isOpen(request)` aus Task 1, `unlockedCookie()` aus Task 2.
- Produces: nichts Neues.

- [ ] **Step 1: Write the failing test**

Ans Ende von `DevLoginLockedTest` anfügen (Import ergänzen: `import org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated`):

```kotlin
    @Test
    fun `the sign-in POST is locked too, not just the page that shows it`() {
        // TestUserSeeder is committed, so the seed logins are public. An unguarded POST is the
        // picker without the picker.
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "leela")
        }.andExpect {
            status { is3xxRedirection() }
            // Back to the keyhole, not into a dead end.
            redirectedUrl("/login/github")
            match(unauthenticated())
        }
    }

    @Test
    fun `with the cookie the sign-in POST works as before`() {
        // Positive control: without it the rejection above would also pass on a POST that is
        // broken for everyone.
        mockMvc.post("/login/github/as") {
            with(csrf())
            cookie(unlockedCookie())
            param("login", "leela")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/")
        }
    }
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd core && ./mvnw test -Dtest=DevLoginLockedTest
```

Erwartet: FAIL — der erste Test bekommt `redirectedUrl("/")` statt `/login/github`, weil `loginAs` die Anmeldung noch durchführt.

- [ ] **Step 3: Guard the POST**

In `loginAs`, als erste Anweisung vor dem Auflösen des Benutzers:

```kotlin
        // The picker's own door is guarded (see picker); this is the other one. Sending the
        // caller to the keyhole rather than refusing flatly keeps the dev flow obvious.
        if (!gate.isOpen(request)) {
            return RedirectView("/login/github").apply { setExpandUriTemplateVariables(false) }
        }
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd core && ./mvnw test -Dtest=DevLoginLockedTest
```

Erwartet: alle zehn Tests der Klasse grün.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/devauth/DevLoginController.kt \
        core/src/test/kotlin/org/unividuell/countdown/core/iam/devauth/DevLoginLockedTest.kt
git commit -F - <<'EOF'
Lock the sign-in POST, not only its page

The picker has two doors. TestUserSeeder is committed, so its logins are
public knowledge -- guarding only the rendered list would leave the POST
as the same picker without a user interface.

It redirects to the keyhole rather than refusing flatly: a developer who
lands here has the way back in front of them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Konfiguration, Deployment und Guideline

**Files:**
- Modify: `core/src/main/resources/application.yaml`
- Modify: `core/src/main/resources/application-staging.yaml`
- Modify: `deploy/compose.yaml`
- Modify: `deploy/.env.staging.example`
- Modify: `deploy/README.md`
- Modify: `.claude/guidelines/security-and-auth.md`

**Interfaces:**
- Consumes: das Property `app.test-auth.key` aus Task 1.
- Produces: nichts, was Code liest.

- [ ] **Step 1: Wire the property locally**

In `core/src/main/resources/application.yaml`, im vorhandenen `app.test-auth`-Block unter `enabled`:

```yaml
  test-auth:
    # Emulator-style test login (seeded users + picker). Default on for localhost.
    # Set false to replay the real prod GitHub OAuth flow locally (no seed, no picker).
    enabled: true
    # The key that unlocks the picker, once per browser profile. Empty means no lock — the
    # localhost default, because multi-user testing here means several browser profiles at once
    # and a lock would only cost typing. The variable is named after what the thing is called in
    # conversation; it is the one place in this file where env name and property path differ.
    key: ${FAKE_SIGN_IN_KEY:}
```

- [ ] **Step 2: Require it on staging**

In `core/src/main/resources/application-staging.yaml`, im vorhandenen `app.test-auth`-Block:

```yaml
app:
  test-auth:
    enabled: true
    # No default, unlike the base application.yaml: staging runs the real datasets on a public
    # URL. FakeSignInGate additionally refuses to start when this binds empty — Compose passes a
    # missing variable through as an empty string, which a bare `${...}` would not catch.
    key: ${FAKE_SIGN_IN_KEY}
```

- [ ] **Step 3: Pass it through Compose**

In `deploy/compose.yaml`, in der `environment`-Liste des `core`-Dienstes hinter `SUPER_ADMIN_GITHUB_LOGINS`:

```yaml
      # Unlocks the fake sign-in picker on staging; prod shares this file but never reads the
      # value (the picker does not exist there), so the default keeps Compose from warning.
      - FAKE_SIGN_IN_KEY=${FAKE_SIGN_IN_KEY:-}
```

- [ ] **Step 4: Document it for the server**

In `deploy/.env.staging.example`, hinter der `SUPER_ADMIN_GITHUB_LOGINS`-Zeile:

```
# Unlocks the fake sign-in picker, once per browser profile. There is no rate limit, so use 24+
# random characters from a password manager, not a memorable word. The stack refuses to start
# without it. Rotating the value locks out new browsers only; sessions already open stay open.
FAKE_SIGN_IN_KEY=change-me-staging
```

In `deploy/README.md` drei Stellen:

1. Im Absatz „**Existing deployments:**“ direkt darunter einen neuen Migrationshinweis:

```markdown
**Migrating an existing stack for the fake sign-in key:** add `FAKE_SIGN_IN_KEY` to
`.env.staging` by hand **before** the next `./update.sh staging` — the backend refuses to boot
without it under the staging profile. Use 24+ random characters: the picker has no rate limit.
`.env.prod` needs nothing; the picker does not exist in production.
```

2. Im Bootstrap-Codeblock die staging-Kommentarzeile ergänzen:

```bash
# edit .env.staging: POSTGRES_PASSWORD (own), PGADMIN_PASSWORD, FAKE_SIGN_IN_KEY,
#   SPOT_OBJECT_MAPS_API_KEY, SPOT_OBJECT_SERVER_MAPS_API_KEY, SPOT_OBJECT_SIGNING_SECRET;
#   GITHUB_CLIENT_SECRET=unused is fine
#   (SUPER_ADMIN_GITHUB_LOGINS=bender comes from the template on this first run — see note above for existing stacks)
```

- [ ] **Step 5: Write the rule down**

In `.claude/guidelines/security-and-auth.md`, ans Ende des Abschnitts „Test login (non-prod only — Firebase-emulator pattern)“:

```markdown
- **Staging's picker is locked with a key** (`app.test-auth.key`, env `FAKE_SIGN_IN_KEY` — the one
  place where env name and property path deliberately differ). `FakeSignInGate` guards **both**
  doors, `/login/github` and `POST /login/github/as`: `TestUserSeeder` is committed, so an
  unguarded POST is the picker without a picker. A browser presents a year-long cookie holding the
  key's SHA-256 (`Path=/login`, `HttpOnly`, `SameSite=Lax`, `Secure` from the request) — the hash,
  not the key, because the DevTools cookie panel shows values in the clear. Empty key = no lock,
  which is the localhost default; under `staging` an empty key **fails the boot**, because Compose
  passes a missing variable through as an empty string rather than as an error. Design:
  [the gate spec](../../docs/superpowers/specs/2026-09-11-fake-sign-in-gate-design.md).
- **The lock sits on the picker, not on the API** — so it holds only as long as the picker is the
  only way into a session on staging. `/oauth2/authorization/github` stays `permitAll` and is
  merely *inert* there today (placeholder client secret, callback pointing at the prod origin).
  **Giving staging its own GitHub OAuth App would open a second entrance past the lock** and this
  design would have to move with it.
```

- [ ] **Step 6: Verify the whole suite**

```bash
cd core && ./mvnw test
```

Erwartet: grün. Insbesondere `DevLoginControllerTest`, `DevLoginProdAbsentTest` und `TestUserSeederTest` sind unverändert — `core/src/test/resources/application.yaml` setzt `app.test-auth.key` nicht, der Schlüssel bleibt dort leer, das Schloss ist offen.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/resources/application.yaml core/src/main/resources/application-staging.yaml \
        deploy/compose.yaml deploy/.env.staging.example deploy/README.md \
        .claude/guidelines/security-and-auth.md
git commit -F - <<'EOF'
Require the fake sign-in key on staging

The property sits in the existing app.test-auth block beside `enabled`,
because both describe the same tool, and is fed from FAKE_SIGN_IN_KEY --
the one place in this project where env name and property path differ on
purpose. Locally it defaults to empty, which means no lock.

Compose passes the variable through with a default so prod, which shares
the file and never reads the value, does not warn. On the server the value
goes into .env.staging by hand before the next update.sh run: update.sh
never back-fills an existing env file, and the boot now fails without it.

The guideline records the open flank as well -- the lock guards the picker,
so giving staging its own GitHub OAuth App would open a second entrance
past it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Danach: von Hand prüfen

Die Tests decken das Verhalten ab, nicht das Aussehen. Einmal lokal ansehen, weil der gesperrte Bildschirm serverseitig gerendert wird und niemand sonst ihn je zu Gesicht bekommt:

```bash
cd core && FAKE_SIGN_IN_KEY=open-sesame ./mvnw spring-boot:run
```

Dann `http://localhost:8080/login/github` im Browser: gesperrter Bildschirm auf dem Telefonformat (DevTools, 375px), falscher Schlüssel, richtiger Schlüssel, Picker, Logout, wieder Picker ohne erneutes Tippen.

## Nicht Teil dieses Plans

Aus der Spec, bewusst nicht gebaut: Rate-Limit, Auswerfen bestehender Sitzungen, Schlüssel pro Person, Freischaltung auf localhost. Kein Frontend-Anteil, keine Migration, keine Änderung an `update.sh`.
