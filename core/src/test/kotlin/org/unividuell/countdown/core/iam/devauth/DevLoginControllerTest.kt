package org.unividuell.countdown.core.iam.devauth

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import jakarta.servlet.ServletException
import java.net.URI
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
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.iam.internal.devauth.TestUserSeeder

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DevLoginControllerTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val users: UserRepository,
    @Autowired val seeder: TestUserSeeder,
) {
    @Test
    fun `GET login github renders the test-user picker`() {
        mockMvc.get("/login/github").andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith("text/html") }
            content { contentType("text/html;charset=UTF-8") }
            content { string(containsString("leela")) }
            content { string(containsString("Turanga Leela")) }
            content { string(containsString("🦞")) }
            // The chip is decorative — the name sits in the span beside it, so without this a
            // screen reader announces "lobster Dr. Zoidberg".
            content { string(containsString("""<span class="chip" aria-hidden="true">🦞</span>""")) }
        }
    }

    @Test
    fun `POST login github as logs in the chosen seeded user`() {
        // Positive control for the rejection test below: proves a real seed login still
        // succeeds, so that test's rejection can't be passing for the wrong reason.
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

    @Test
    fun `POST login github as rejects a login that exists but is not a seed user`() {
        users.save(User(githubId = 4242L, githubLogin = "octocat"))
        // Pins the rejection below to "exists but isn't a seed login" rather than "no such user":
        // loginAs raises the identical error for both, so without this the test would keep
        // passing even if the save/lookup above silently stopped working.
        users.findByGithubLogin("octocat").shouldNotBeNull()

        // Same rejection mechanism as an unknown login: the `error(...)` call surfaces as an
        // uncaught IllegalStateException, which MockMvc propagates wrapped in a ServletException
        // rather than resolving it to a response.
        val thrown = shouldThrow<ServletException> {
            mockMvc.post("/login/github/as") {
                with(csrf())
                param("login", "octocat")
            }
        }
        thrown.cause?.message shouldBe "unknown test user: octocat"
    }

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

    @Test
    fun `picker drops the button of a seed user whose row is gone, and keeps the rest`() {
        // @Transactional rolls this back; the row is restored for every other test.
        users.delete(users.findByGithubLogin("zoidberg").shouldNotBeNull())

        val html = mockMvc.get("/login/github").andReturn().response.contentAsString

        html shouldNotContain """name="login" value="zoidberg""""
        // The point of dropping just the one button: the page still works. Without this the test
        // would also pass on a picker that rendered nothing at all.
        html shouldContain """name="login" value="Fry""""
        html shouldContain """name="login" value="mom""""
    }

    @Test
    fun `the picker carries a redirect through to the login form`() {
        // mockMvc.get(String) re-encodes a URI template, which would double-encode a query value
        // that already carries percent-escapes (%3F, %3D here); mockMvc.get(URI) takes the URI
        // as-is, so the escapes reach the server exactly once decoded.
        mockMvc.get(URI("/login/github?redirect=/c/team/lab/sample%3Fseed%3D42")).andExpect {
            status { isOk() }
            content { string(containsString("""name="redirect" value="/c/team/lab/sample?seed=42"""")) }
        }
    }

    @Test
    fun `the picker escapes a redirect containing markup`() {
        // The value is echoed into HTML; without escaping the picker is an XSS hole even in dev.
        mockMvc.get("""/login/github?redirect=/x"><script>alert(1)</script>""").andExpect {
            status { isOk() }
            content { string(containsString("&lt;script&gt;")) }
        }
    }

    @Test
    fun `login as returns to the requested path`() {
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "leela")
            param("redirect", "/c/team/lab/sample?seed=42")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/c/team/lab/sample?seed=42")
        }
    }

    @Test
    fun `login as ignores an off-site redirect`() {
        // Protocol-relative and absolute URLs both leave the site; the picker is permitAll, so an
        // open redirect here would be a real one. The three control-character cases are not
        // paranoia: browsers strip tab, CR and LF from a URL before resolving it, so each of them
        // becomes `//evil.example` — protocol-relative — after a naive prefix check has passed it.
        listOf(
            "//evil.example",
            "https://evil.example",
            "/\\evil.example",
            "evil",
            "/\t/evil.example",
            "/\n/evil.example",
            "/\r/evil.example",
        ).forEach { hostile ->
            mockMvc.post("/login/github/as") {
                with(csrf())
                param("login", "leela")
                param("redirect", hostile)
            }.andExpect {
                status { is3xxRedirection() }
                redirectedUrl("/")
            }
        }
    }

    @Test
    fun `login as redirects to a path containing a brace instead of 500ing`() {
        // RedirectView expands "{...}" as a URI template against the model by default; with no
        // model entry for "b" that throws and turns a permitAll endpoint into a 500. A brace in a
        // path is legitimate, so expansion must be off rather than braces being rejected.
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "leela")
            param("redirect", "/a{b}")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/a{b}")
        }
    }

    @Test
    fun `login as without a redirect still lands on the app root`() {
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "leela")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/")
        }
    }
}
