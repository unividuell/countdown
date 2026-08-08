package org.unividuell.countdown.core.gamelab

import tools.jackson.module.kotlin.jacksonObjectMapper
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
import org.unividuell.countdown.core.gamelab.internal.AlreadyGuessedException
import org.unividuell.countdown.core.gamelab.internal.InvalidGuessException
import org.unividuell.countdown.core.gamelab.internal.LabAccessDeniedException
import org.unividuell.countdown.core.gamelab.internal.LabRoundResponse
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.gamelab.internal.SamplePayload
import org.unividuell.countdown.core.gamelab.internal.UnknownLabGameException
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class LabControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var service: LabService

    private val uid = TEST_USER_ID
    private val mapper = jacksonObjectMapper()

    private fun response(seed: Int, tookOver: Boolean = false) = LabRoundResponse(
        seed = seed,
        game = "sample",
        displayName = "Zahlenraten (Attrappe)",
        payload = SamplePayload(lowerBound = 100, upperBound = 199),
        me = null,
        others = emptyList(),
        tookOverRound = tookOver,
    )

    @Test
    fun `GET opens the round at the requested seed`() {
        every { service.open("team", "sample", 42, uid, false) } returns response(42)

        mockMvc.get("/api/lab/team/sample?seed=42") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.seed") { value(42) }
            jsonPath("$.game") { value("sample") }
            jsonPath("$.payload.lowerBound") { value(100) }
            jsonPath("$.tookOverRound") { value(false) }
        }
    }

    @Test
    fun `GET reports a round takeover`() {
        every { service.open("team", "sample", 99, uid, false) } returns response(99, tookOver = true)

        mockMvc.get("/api/lab/team/sample?seed=99") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.tookOverRound") { value(true) }
        }
    }

    @Test
    fun `GET passes the super-admin flag through`() {
        every { service.open("team", "sample", 42, uid, true) } returns response(42)

        mockMvc.get("/api/lab/team/sample?seed=42") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isOk() } }

        verify { service.open("team", "sample", 42, uid, true) }
    }

    @Test
    fun `GET without a seed is a bad request`() {
        mockMvc.get("/api/lab/team/sample") { with(principalFor()) }
            .andExpect { status { isBadRequest() } }
    }

    @Test
    fun `GET 404s a non-member`() {
        every { service.open("secret", "sample", 42, uid, false) } throws LabAccessDeniedException()

        mockMvc.get("/api/lab/secret/sample?seed=42") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET 404s an unknown game`() {
        every { service.open("team", "nope", 42, uid, false) } throws UnknownLabGameException("no lab game 'nope'")

        mockMvc.get("/api/lab/team/nope?seed=42") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET requires authentication`() {
        mockMvc.get("/api/lab/team/sample?seed=42").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `POST guess forwards the body verbatim`() {
        every {
            service.guess("team", "sample", 42, uid, false, mapper.readTree("""{"value":123}"""))
        } returns response(42)

        mockMvc.post("/api/lab/team/sample/guess?seed=42") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"value":123}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `POST guess 409s a second guess`() {
        every { service.guess("team", "sample", 42, uid, false, any()) } throws AlreadyGuessedException()

        mockMvc.post("/api/lab/team/sample/guess?seed=42") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"value":123}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `POST guess 400s a guess the game rejects`() {
        every { service.guess("team", "sample", 42, uid, false, any()) } throws
            InvalidGuessException("guess must lie in 100..199")

        mockMvc.post("/api/lab/team/sample/guess?seed=42") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"value":5}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `POST reset clears the round`() {
        every { service.resetRound("team", "sample", 42, uid, false) } returns response(42)

        mockMvc.post("/api/lab/team/sample/reset?seed=42") {
            with(principalFor()); with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.seed") { value(42) }
        }
    }

    @Test
    fun `DELETE me forgets only my entry`() {
        every { service.forgetMine("team", "sample", 42, uid, false) } returns response(42)

        mockMvc.delete("/api/lab/team/sample/me?seed=42") {
            with(principalFor()); with(csrf())
        }.andExpect { status { isOk() } }
    }
}
