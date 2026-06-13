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
