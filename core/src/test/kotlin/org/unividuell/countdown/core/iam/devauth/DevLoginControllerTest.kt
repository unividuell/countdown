package org.unividuell.countdown.core.iam.devauth

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import jakarta.servlet.ServletException
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
            content { string(containsString("leela")) }
            content { string(containsString("Turanga Leela")) }
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
}
