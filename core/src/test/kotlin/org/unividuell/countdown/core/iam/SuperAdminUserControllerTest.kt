package org.unividuell.countdown.core.iam

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminRosterService
import org.unividuell.countdown.core.iam.internal.SuperAdminUserResponse
import org.unividuell.countdown.core.principalFor
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminUserControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var roster: SuperAdminRosterService

    private val uid = TEST_USER_ID

    @Test
    fun `forbidden for a non-super-admin`() {
        mockMvc.get("/api/super-admin/super-admins") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `returns the roster for a super-admin`() {
        every { roster.roster() } returns listOf(
            SuperAdminUserResponse(
                githubLogin = "boss", username = "Boss", userId = uid,
                flagged = true, allowlisted = true,
                createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            ),
            SuperAdminUserResponse(
                githubLogin = "ghost", username = null, userId = null,
                flagged = false, allowlisted = true, createdAt = null,
            ),
        )
        mockMvc.get("/api/super-admin/super-admins") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].githubLogin") { value("boss") }
                jsonPath("$[0].flagged") { value(true) }
                jsonPath("$[1].githubLogin") { value("ghost") }
                // Present-and-null, not omitted: no NON_NULL inclusion is configured, and the
                // frontend type is `string | null`. `doesNotExist()` would therefore be wrong.
                jsonPath("$[1].userId") { isEmpty() }
                jsonPath("$[1].allowlisted") { value(true) }
            }
    }
}
