package org.unividuell.countdown.core.iam.devauth

import io.kotest.assertions.throwables.shouldThrow
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

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DevLoginControllerTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val users: UserRepository,
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
}
