package org.unividuell.countdown.core.audiopool

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.unividuell.auth.test.withCsrfToken
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.audiopool.internal.AudioClipNotFoundException
import org.unividuell.countdown.core.audiopool.internal.AudioClipSummary
import org.unividuell.countdown.core.audiopool.internal.AudioPoolAccessDeniedException
import org.unividuell.countdown.core.audiopool.internal.AudioPoolContext
import org.unividuell.countdown.core.audiopool.internal.AudioPoolException
import org.unividuell.countdown.core.audiopool.internal.AudioPoolFullException
import org.unividuell.countdown.core.audiopool.internal.AudioPoolGate
import org.unividuell.countdown.core.audiopool.internal.AudioPoolService
import org.unividuell.countdown.core.audiopool.internal.AudioTooLargeException
import org.unividuell.countdown.core.audiopool.internal.BrokenAudioException
import org.unividuell.countdown.core.audiopool.internal.DuplicateAudioException
import org.unividuell.countdown.core.audiopool.internal.UnsupportedAudioFormatException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class AudioPoolControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var gate: AudioPoolGate
    @MockkBean lateinit var service: AudioPoolService
    @MockkBean lateinit var users: UserQuery

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val clipId = UUID.fromString("018f0000-0000-7000-8000-0000000000e1")
    private val memberPool = AudioPoolContext(communityId = communityId, viewerIsAdmin = false)

    // 72 000 frames at 48 kHz: 1.5 s.
    private val summary = AudioClipSummary(
        id = clipId, communityId = communityId, uploadedBy = TEST_USER_ID, fileName = "spruch.wav",
        channels = 2, sampleRate = 48_000, frames = 72_000, byteSize = 288_044,
        createdAt = Instant.parse("2026-09-01T10:00:00Z"),
    )

    private fun asMember() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
    }

    @Test
    fun `a non-member gets 404, never 403`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } throws AudioPoolAccessDeniedException()

        mockMvc.get("/api/communities/alpha/audio") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `the listing carries quota, maxBytes and the uploader's name, never bytes`() {
        asMember()
        every { service.list(pool = memberPool, viewerId = TEST_USER_ID) } returns listOf(summary)
        every { service.count(memberPool) } returns 12L
        every { service.limitOf(memberPool) } returns 200
        every { service.maxBytes() } returns 5_242_880
        every { users.findAllById(listOf(TEST_USER_ID)) } returns
            listOf(User(id = TEST_USER_ID, subject = "1", githubLogin = "alice"))

        mockMvc.get("/api/communities/alpha/audio") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(12) }
                jsonPath("$.limit") { value(200) }
                jsonPath("$.maxBytes") { value(5_242_880) }
                // memberPool is not an admin's: the page uses this to drop the quota and the
                // uploader's name, both of which say nothing when you only see your own rows.
                jsonPath("$.viewerIsAdmin") { value(false) }
                jsonPath("$.clips[0].id") { value(clipId.toString()) }
                jsonPath("$.clips[0].fileName") { value("spruch.wav") }
                jsonPath("$.clips[0].durationMs") { value(1500) }
                jsonPath("$.clips[0].channels") { value(2) }
                jsonPath("$.clips[0].byteSize") { value(288_044) }
                jsonPath("$.clips[0].uploadedBy") { value("alice") }
                jsonPath("$.clips[0].bytes") { doesNotExist() }
            }
    }

    @Test
    fun `a listed clip appears with a question mark when its uploader row is gone`() {
        asMember()
        every { service.list(pool = memberPool, viewerId = TEST_USER_ID) } returns listOf(summary)
        every { service.count(memberPool) } returns 1L
        every { service.limitOf(memberPool) } returns 200
        every { service.maxBytes() } returns 5_242_880
        every { users.findAllById(listOf(TEST_USER_ID)) } returns emptyList()

        mockMvc.get("/api/communities/alpha/audio") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.clips[0].id") { value(clipId.toString()) }
                jsonPath("$.clips[0].uploadedBy") { value("?") }
            }
    }

    @Test
    fun `an upload passes the original file name on`() {
        asMember()
        val bytes = byteArrayOf(1, 2, 3)
        every {
            service.upload(pool = memberPool, uploaderId = TEST_USER_ID, fileName = any(), bytes = any())
        } returns summary
        every { users.findAllById(listOf(TEST_USER_ID)) } returns
            listOf(User(id = TEST_USER_ID, subject = "1", githubLogin = "alice"))

        mockMvc.multipart("/api/communities/alpha/audio") {
            file(MockMultipartFile("file", "spruch.wav", "audio/wav", bytes))
            with(principalFor()); with(withCsrfToken())
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(clipId.toString()) }
            jsonPath("$.uploadedBy") { value("alice") }
        }

        verify {
            service.upload(
                pool = memberPool,
                uploaderId = TEST_USER_ID,
                fileName = "spruch.wav",
                bytes = match { it.contentEquals(bytes) },
            )
        }
    }

    @Test
    fun `the WAV is served as audio-wav and cached privately for a year`() {
        asMember()
        every { service.wav(pool = memberPool, id = clipId, viewerId = TEST_USER_ID) } returns byteArrayOf(9, 9)

        mockMvc.get("/api/communities/alpha/audio/$clipId") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                header { string("Content-Type", "audio/wav") }
                header { string("Cache-Control", "private, max-age=31536000, immutable") }
                header { doesNotExist("ETag") }
            }
    }

    @Test
    fun `a clip the viewer may not see answers 404 with its code`() {
        asMember()
        every {
            service.wav(pool = memberPool, id = clipId, viewerId = TEST_USER_ID)
        } throws AudioClipNotFoundException()

        mockMvc.get("/api/communities/alpha/audio/$clipId") { with(principalFor()) }
            .andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("NOT_FOUND") }
            }
    }

    @Test
    fun `refusals carry their code and status`() {
        asMember()
        listOf(
            Refusal(thrown = AudioPoolFullException(200), status = 409, code = "POOL_FULL"),
            Refusal(thrown = DuplicateAudioException(), status = 409, code = "DUPLICATE"),
            Refusal(thrown = AudioTooLargeException(5_242_880), status = 413, code = "TOO_LARGE"),
            Refusal(thrown = UnsupportedAudioFormatException(), status = 415, code = "UNSUPPORTED_FORMAT"),
            Refusal(thrown = BrokenAudioException(), status = 422, code = "BROKEN_AUDIO"),
        ).forEach { refusal ->
            every {
                service.upload(pool = memberPool, uploaderId = TEST_USER_ID, fileName = any(), bytes = any())
            } throws refusal.thrown

            mockMvc.multipart("/api/communities/alpha/audio") {
                file(MockMultipartFile("file", "a.wav", "audio/wav", byteArrayOf(1, 2, 3)))
                with(principalFor()); with(withCsrfToken())
            }.andExpect {
                status { isEqualTo(refusal.status) }
                jsonPath("$.code") { value(refusal.code) }
            }
        }
    }

    private class Refusal(val thrown: AudioPoolException, val status: Int, val code: String)

    @Test
    fun `a body the container refuses is the same TOO_LARGE`() {
        asMember()
        every {
            service.upload(pool = memberPool, uploaderId = TEST_USER_ID, fileName = any(), bytes = any())
        } throws MaxUploadSizeExceededException(15L * 1024 * 1024)

        mockMvc.multipart("/api/communities/alpha/audio") {
            file(MockMultipartFile("file", "a.wav", "audio/wav", byteArrayOf(1, 2, 3)))
            with(principalFor()); with(withCsrfToken())
        }.andExpect {
            status { isEqualTo(413) }
            jsonPath("$.code") { value("TOO_LARGE") }
        }
    }

    @Test
    fun `deleting answers 204`() {
        asMember()
        every { service.delete(pool = memberPool, id = clipId, viewerId = TEST_USER_ID) } returns Unit

        mockMvc.delete("/api/communities/alpha/audio/$clipId") { with(principalFor()); with(withCsrfToken()) }
            .andExpect { status { isNoContent() } }
    }
}
