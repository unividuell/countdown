package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.GameDto
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundDto
import org.unividuell.countdown.core.game.internal.RoundResponse
import org.unividuell.countdown.core.principalFor
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class RoundControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var announcements: AnnouncementService

    private val uid = TEST_USER_ID

    @Test
    fun `GET current round returns the round and its game`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = false)
        } returns RoundResponse(
            round = RoundDto(
                number = 12, label = "T-12",
                start = Instant.parse("2026-08-12T10:00:00Z"),
                end = Instant.parse("2026-08-13T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung"),
            noGameReason = null,
        )

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.round.number") { value(12) }
            jsonPath("$.round.label") { value("T-12") }
            jsonPath("$.game.id") { value("guess-hue") }
            jsonPath("$.game.displayName") { value("Farbausmalung") }
        }
    }

    @Test
    fun `GET current round names the reason when there is no game`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = false)
        } returns RoundResponse(round = null, game = null, noGameReason = NoGameReason.NOT_SCHEDULED)

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.noGameReason") { value("NOT_SCHEDULED") }
        }
    }

    @Test
    fun `GET current round is 404 for a non-member`() {
        every {
            announcements.currentRound(slug = "secret", userId = uid, isSuperAdmin = false)
        } throws RoundAccessDeniedException()

        mockMvc.get("/api/communities/secret/rounds/current") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET current round passes the super-admin flag through`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = true)
        } returns RoundResponse(round = null, game = null, noGameReason = NoGameReason.NOT_SCHEDULED)

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `GET current round requires a session`() {
        mockMvc.get("/api/communities/team/rounds/current").andExpect { status { isUnauthorized() } }
    }
}
