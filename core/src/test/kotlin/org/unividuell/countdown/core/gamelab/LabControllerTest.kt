package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.json.JsonMapper
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.gamelab.internal.AlreadyGuessedException
import org.unividuell.countdown.core.gamelab.internal.LabAccessDeniedException
import org.unividuell.countdown.core.gamelab.internal.LabRoundResponse
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.gamelab.internal.UnknownLabGameException
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class LabControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var service: LabService

    private val uid = TEST_USER_ID
    private val mapper = JsonMapper.builder().build()

    /** A stand-in payload: the controller only forwards what the (mocked) service returns. */
    private data class FakePayload(val note: String = "test") : GamePayload

    private fun aResponse(seed: Int = 42, phase: Phase = Phase.ONE, tookOver: Boolean = false) = LabRoundResponse(
        seed = seed,
        phase = phase,
        game = "guess-hue",
        displayName = "Farbausmalung",
        awardRule = AwardRule.ALL_QUALIFYING,
        awardPoints = 1,
        payload = FakePayload(),
        solution = null,
        me = null,
        others = emptyList(),
        tookOverRound = tookOver,
        myStage = 0,
    )

    @Test
    fun `GET opens the round at the requested seed`() {
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(seed = 42)

        mockMvc.get("/api/lab/team/guess-hue?seed=42") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.seed") { value(42) }
            jsonPath("$.game") { value("guess-hue") }
            jsonPath("$.payload.note") { value("test") }
            jsonPath("$.tookOverRound") { value(false) }
        }
    }

    @Test
    fun `GET reports a round takeover`() {
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 99, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(seed = 99, tookOver = true)

        mockMvc.get("/api/lab/team/guess-hue?seed=99") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.tookOverRound") { value(true) }
        }
    }

    @Test
    fun `GET passes the super-admin flag through`() {
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = true,
            )
        } returns aResponse(seed = 42)

        mockMvc.get("/api/lab/team/guess-hue?seed=42") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isOk() } }

        verify {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = true,
            )
        }
    }

    @Test
    fun `GET without a seed is a bad request`() {
        mockMvc.get("/api/lab/team/guess-hue") { with(principalFor()) }
            .andExpect { status { isBadRequest() } }
    }

    @Test
    fun `GET 404s a non-member`() {
        every {
            service.open(
                slug = "secret", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } throws LabAccessDeniedException()

        mockMvc.get("/api/lab/secret/guess-hue?seed=42") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET 404s an unknown game`() {
        every {
            service.open(
                slug = "team", gameId = "nope", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } throws UnknownLabGameException("no game 'nope'")

        mockMvc.get("/api/lab/team/nope?seed=42") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET requires authentication`() {
        mockMvc.get("/api/lab/team/guess-hue?seed=42").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `POST guess forwards the body verbatim`() {
        every {
            service.guess(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false, guess = mapper.readTree("""{"hue":123.5}"""),
            )
        } returns aResponse(seed = 42)

        mockMvc.post("/api/lab/team/guess-hue/guess?seed=42") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":123.5}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `POST guess 409s a second guess`() {
        every {
            service.guess(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false, guess = any(),
            )
        } throws AlreadyGuessedException()

        mockMvc.post("/api/lab/team/guess-hue/guess?seed=42") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":123.5}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `POST guess 400s a guess the game rejects`() {
        every {
            service.guess(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false, guess = any(),
            )
        } throws InvalidGuessException("hue must lie in [0, 360), was 400.0")

        mockMvc.post("/api/lab/team/guess-hue/guess?seed=42") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":400.0}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `POST reset clears the round`() {
        every {
            service.resetRound(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(seed = 42)

        mockMvc.post("/api/lab/team/guess-hue/reset?seed=42") {
            with(principalFor()); with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.seed") { value(42) }
        }
    }

    @Test
    fun `DELETE me forgets only my entry`() {
        every {
            service.forgetMine(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(seed = 42)

        mockMvc.delete("/api/lab/team/guess-hue/me?seed=42") {
            with(principalFor()); with(csrf())
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `GET passes the phase through, and defaults it to one`() {
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.TWO,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(phase = Phase.TWO)
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(phase = Phase.ONE)

        mockMvc.get("/api/lab/team/guess-hue?seed=42&phase=TWO") { with(principalFor()) }
            .andExpect { status { isOk() }; jsonPath("$.phase") { value("TWO") } }
        // No phase in the URL is phase one — every link that predates the selector keeps working.
        mockMvc.get("/api/lab/team/guess-hue?seed=42") { with(principalFor()) }
            .andExpect { status { isOk() }; jsonPath("$.phase") { value("ONE") } }
    }
}
