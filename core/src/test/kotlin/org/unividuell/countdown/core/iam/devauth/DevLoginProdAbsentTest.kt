package org.unividuell.countdown.core.iam.devauth

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration

/** Under the production profile: test-auth.enabled=false → picker absent, redirect controller active. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("production")
class DevLoginProdAbsentTest(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `GET login github redirects to real GitHub OAuth (picker absent in production)`() {
        mockMvc.get("/login/github").andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/oauth2/authorization/github")
        }
    }
}
