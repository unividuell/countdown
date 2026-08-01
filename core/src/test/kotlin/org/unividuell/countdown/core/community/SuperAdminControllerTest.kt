package org.unividuell.countdown.core.community

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
import org.unividuell.countdown.core.community.internal.SuperAdminCommunityResponse
import org.unividuell.countdown.core.community.internal.SuperAdminMemberResponse
import org.unividuell.countdown.core.community.internal.SuperAdminOverviewService
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var overview: SuperAdminOverviewService

    private val uid = TEST_USER_ID

    @Test
    fun `forbidden for a non-super-admin`() {
        mockMvc.get("/api/super-admin/communities") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `returns the system-wide overview for a super-admin`() {
        every { overview.overview() } returns listOf(
            SuperAdminCommunityResponse(
                id = UUID.fromString("018f0000-0000-7000-8000-0000000000a1"),
                name = "Alpha", slug = "alpha", startsAt = null,
                startsAtTimezone = "Europe/Berlin",
                createdAt = Instant.parse("2026-01-01T00:00:00Z"),
                members = listOf(
                    SuperAdminMemberResponse(
                        userId = uid, username = "Alice", githubLogin = "alice",
                        status = "ACTIVE", isAdmin = true,
                        joinedAt = Instant.parse("2026-02-01T00:00:00Z"),
                    ),
                ),
            ),
        )
        mockMvc.get("/api/super-admin/communities") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].slug") { value("alpha") }
                jsonPath("$[0].startsAtTimezone") { value("Europe/Berlin") }
                jsonPath("$[0].members[0].githubLogin") { value("alice") }
                jsonPath("$[0].members[0].isAdmin") { value(true) }
            }
    }
}
