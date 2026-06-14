package org.unividuell.countdown.core.countdown

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.countdown.internal.CountdownService
import org.unividuell.countdown.core.countdown.internal.CountdownResponse
import org.unividuell.countdown.core.countdown.internal.RoundDto
import org.unividuell.countdown.core.countdown.internal.CountdownAccessDeniedException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class CountdownControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var service: CountdownService

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")
    private fun principal() = authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), mapOf("login" to "octocat")),
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), emptyMap()).authorities,
            "github",
        )
    )

    @Test
    fun `GET countdown returns the current and next round`() {
        val now = Instant.parse("2026-06-14T09:00:00Z")
        every { service.forSlug("team", uid, false) } returns CountdownResponse(
            serverNow = now, startsAt = Instant.parse("2026-06-25T09:00:00Z"), startsAtTimezone = "Europe/Berlin",
            round = RoundDto(10, "T-10", Instant.parse("2026-06-14T09:00:00Z"), Instant.parse("2026-06-15T09:00:00Z")),
            nextRound = RoundDto(9, "T-9", Instant.parse("2026-06-15T09:00:00Z"), Instant.parse("2026-06-16T09:00:00Z")),
        )
        mockMvc.get("/api/communities/team/countdown") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.round.label") { value("T-10") }
            jsonPath("$.nextRound.number") { value(9) }
            jsonPath("$.startsAtTimezone") { value("Europe/Berlin") }
        }
    }

    @Test
    fun `GET countdown 404s a non-member`() {
        every { service.forSlug("secret", uid, false) } throws CountdownAccessDeniedException()
        mockMvc.get("/api/communities/secret/countdown") { with(principal()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET countdown returns null rounds when startsAt is unset`() {
        val now = Instant.parse("2026-06-14T09:00:00Z")
        every { service.forSlug("team", uid, false) } returns CountdownResponse(now, null, "Europe/Berlin", null, null)
        mockMvc.get("/api/communities/team/countdown") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.round") { value(null) }
        }
    }
}
