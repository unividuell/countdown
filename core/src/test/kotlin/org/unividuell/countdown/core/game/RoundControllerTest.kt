package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.slot
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.internal.AlreadyGuessedException
import org.unividuell.countdown.core.game.internal.AlreadyRevealedException
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.GameDto
import org.unividuell.countdown.core.game.internal.GuessHuePayload
import org.unividuell.countdown.core.game.internal.GuessHueSolution
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.MyPlayDto
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.NotRevealedException
import org.unividuell.countdown.core.game.internal.OtherPlayDto
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundDto
import org.unividuell.countdown.core.game.internal.RoundMovedOnException
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.game.internal.RoundResponse
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.principalFor
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class RoundControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var announcements: AnnouncementService
    @MockkBean lateinit var plays: PlayService
    @MockkBean lateinit var histories: HistoryService

    private val uid = TEST_USER_ID
    private val mapper = JsonMapper.builder().build()

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
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung", requiresReveal = false),
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

    @Test
    fun `POST reveal hands out the payload`() {
        every { plays.reveal(slug = "team", userId = uid, isSuperAdmin = false) } returns RoundResponse(
            round = RoundDto(
                number = 12, label = "T-12",
                start = Instant.parse("2026-08-12T10:00:00Z"),
                end = Instant.parse("2026-08-13T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung", requiresReveal = false),
            noGameReason = null,
            payload = GuessHuePayload(
                description = "ein warmes Rot", initHue = 12.5, saturation = 0.6, lightness = 0.45,
                toleranceDeg = 10.0,
            ),
        )

        mockMvc.post("/api/communities/team/rounds/current/reveal") {
            with(principalFor()); with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.payload.description") { value("ein warmes Rot") }
            jsonPath("$.payload.hue") { doesNotExist() }
        }
    }

    @Test
    fun `POST guess passes the body through untouched`() {
        val body = slot<JsonNode>()
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 12, guess = capture(body))
        } returns RoundResponse(round = null, game = null, noGameReason = null)

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":12,"guess":{"hue":123.5}}"""
        }.andExpect { status { isOk() } }

        // The inner guess, not the envelope: the envelope carries roundNumber, but that belongs to
        // the framework, not to the game — the game must see exactly what it would have seen before
        // the envelope existed.
        body.captured shouldBe mapper.readTree("""{"hue":123.5}""")
    }

    @Test
    fun `POST guess withholds qualifies and deviation at wire level, for me and for others alike`() {
        // `PlayDto` and `solution()` are a third exit out of the server next to `present()` and
        // `solution()` field-set tests — pinned here at JSON level, because a field added to the DTO
        // in Kotlin would otherwise reach the wire unnoticed.
        val other = UUID.randomUUID()
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 12, guess = any())
        } returns RoundResponse(
            round = RoundDto(
                number = 12, label = "T-12",
                start = Instant.parse("2026-08-12T10:00:00Z"),
                end = Instant.parse("2026-08-13T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung", requiresReveal = false),
            noGameReason = null,
            solution = GuessHueSolution(targetHue = 123.5, toleranceDeg = 15.0),
            me = MyPlayDto(
                userId = uid,
                username = "me",
                avatar = Avatar(shortName = "ME", bgColorHex = "#123456"),
                stage = 0,
                revealedAt = Instant.parse("2026-08-12T10:01:00Z"),
                guessedAt = Instant.parse("2026-08-12T10:02:00Z"),
                guess = mapper.readTree("""{"hue":123.5}"""),
                outcome = mapper.readTree("""{"deviationDeg":0.0,"withinTolerance":true}"""),
                points = 1,
            ),
            others = listOf(
                OtherPlayDto(
                    userId = other,
                    username = "other",
                    avatar = Avatar(shortName = "OTH", bgColorHex = "#abcdef"),
                    stage = 0,
                    guess = mapper.readTree("""{"hue":30.0}"""),
                    outcome = mapper.readTree("""{"deviationDeg":30.0,"withinTolerance":false}"""),
                    points = 0,
                ),
            ),
        )

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":12,"guess":{"hue":123.5}}"""
        }.andExpect {
            status { isOk() }
            // The framework's comparison values never reach the wire, for the viewer or for others.
            jsonPath("$.me.qualifies") { doesNotExist() }
            jsonPath("$.me.deviation") { doesNotExist() }
            jsonPath("$.others[0].qualifies") { doesNotExist() }
            jsonPath("$.others[0].deviation") { doesNotExist() }
            // What the player is actually told is still there.
            jsonPath("$.me.username") { value("me") }
            jsonPath("$.me.points") { value(1) }
            jsonPath("$.me.outcome.deviationDeg") { value(0.0) }
            jsonPath("$.others[0].username") { value("other") }
            jsonPath("$.others[0].guess.hue") { value(30.0) }
            jsonPath("$.solution.targetHue") { value(123.5) }
            jsonPath("$.solution.toleranceDeg") { value(15.0) }
        }
    }

    @Test
    fun `POST guess keeps the others' timestamps off the wire`() {
        val other = UUID.randomUUID()
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 12, guess = any())
        } returns RoundResponse(
            round = RoundDto(
                number = 12, label = "T-12",
                start = Instant.parse("2026-08-12T10:00:00Z"),
                end = Instant.parse("2026-08-13T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung", requiresReveal = false),
            noGameReason = null,
            me = MyPlayDto(
                userId = uid,
                username = "me",
                avatar = Avatar(shortName = "ME", bgColorHex = "#123456"),
                stage = 0,
                revealedAt = Instant.parse("2026-08-12T10:01:00Z"),
                guessedAt = Instant.parse("2026-08-12T10:02:00Z"),
                guess = mapper.readTree("""{"hue":123.5}"""),
                outcome = null,
                points = 1,
            ),
            others = listOf(
                OtherPlayDto(
                    userId = other,
                    username = "other",
                    avatar = Avatar(shortName = "OTH", bgColorHex = "#abcdef"),
                    stage = 0,
                    guess = mapper.readTree("""{"hue":30.0}"""),
                    outcome = null,
                    points = 0,
                ),
            ),
        )

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":12,"guess":{"hue":123.5}}"""
        }.andExpect {
            status { isOk() }
            // When the others played is nobody's business: the viewer sees that they played, and what
            // they guessed, never at which second.
            jsonPath("$.others[0].revealedAt") { doesNotExist() }
            jsonPath("$.others[0].guessedAt") { doesNotExist() }
            // The viewer's own stamps stay — `guessedAt` is what the card's face is derived from.
            jsonPath("$.me.guessedAt") { exists() }
        }
    }

    @Test
    fun `guessing without revealing is a conflict`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 12, guess = any())
        } throws NotRevealedException()

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":12,"guess":{"hue":1.0}}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `a second reveal of a strict round is a conflict`() {
        every { plays.reveal(slug = "team", userId = uid, isSuperAdmin = false) } throws
            AlreadyRevealedException()

        mockMvc.post("/api/communities/team/rounds/current/reveal") {
            with(principalFor()); with(csrf())
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `a second guess is a conflict too`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 12, guess = any())
        } throws AlreadyGuessedException()

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":12,"guess":{"hue":1.0}}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `a malformed guess is a bad request`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 12, guess = any())
        } throws InvalidGuessException("hue must lie in [0, 360), was 400.0")

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":12,"guess":{"hue":400.0}}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a stale round number is a conflict`() {
        every {
            plays.guess(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 11, guess = any())
        } throws RoundMovedOnException(current = 12)

        mockMvc.post("/api/communities/team/rounds/current/guess") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"roundNumber":11,"guess":{"hue":1.0}}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `POST reveal requires a session`() {
        mockMvc.post("/api/communities/team/rounds/current/reveal") { with(csrf()) }
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `GET a past round returns it with its previous-round pointer`() {
        every {
            histories.pastRound(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 13)
        } returns RoundResponse(
            round = RoundDto(
                number = 13, label = "T-13",
                start = Instant.parse("2026-08-11T10:00:00Z"),
                end = Instant.parse("2026-08-12T10:00:00Z"),
            ),
            game = GameDto(id = "guess-hue", displayName = "Farbausmalung", requiresReveal = false),
            noGameReason = null,
            previousRoundNumber = 14,
            solution = GuessHueSolution(targetHue = 5.0, toleranceDeg = 10.0),
        )

        mockMvc.get("/api/communities/team/rounds/13") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.round.number") { value(13) }
            jsonPath("$.previousRoundNumber") { value(14) }
            jsonPath("$.solution.targetHue") { value(5.0) }
        }
    }

    @Test
    fun `GET a round that is not history is 404`() {
        every {
            histories.pastRound(slug = "team", userId = uid, isSuperAdmin = false, roundNumber = 11)
        } throws RoundNotFoundException()

        mockMvc.get("/api/communities/team/rounds/11") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET a past round passes the super-admin flag through`() {
        every {
            histories.pastRound(slug = "team", userId = uid, isSuperAdmin = true, roundNumber = 13)
        } returns RoundResponse(round = null, game = null, noGameReason = null)

        mockMvc.get("/api/communities/team/rounds/13") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `GET a past round requires a session`() {
        mockMvc.get("/api/communities/team/rounds/13").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `the current segment still wins over the round-number template`() {
        every {
            announcements.currentRound(slug = "team", userId = uid, isSuperAdmin = false)
        } returns RoundResponse(round = null, game = null, noGameReason = NoGameReason.NOT_SCHEDULED)

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.noGameReason") { value("NOT_SCHEDULED") }
        }
    }
}
