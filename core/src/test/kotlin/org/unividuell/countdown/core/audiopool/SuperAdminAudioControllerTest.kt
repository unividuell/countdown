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
import org.unividuell.auth.test.withCsrfToken
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.audiopool.internal.AudioClipSummary
import org.unividuell.countdown.core.audiopool.internal.AudioPoolContext
import org.unividuell.countdown.core.audiopool.internal.AudioPoolGate
import org.unividuell.countdown.core.audiopool.internal.AudioPoolService
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminAudioControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var gate: AudioPoolGate
    @MockkBean lateinit var service: AudioPoolService
    @MockkBean lateinit var users: UserQuery

    private val globalPool = AudioPoolContext(communityId = null, viewerIsAdmin = true)

    @Test
    fun `a super-admin lists the global pool`() {
        every { gate.global(true) } returns globalPool
        every { service.list(pool = globalPool, viewerId = TEST_USER_ID) } returns emptyList()
        every { service.count(globalPool) } returns 3L
        every { service.limitOf(globalPool) } returns 50
        every { service.maxBytes() } returns 5_242_880
        every { users.findAllById(emptyList()) } returns emptyList()

        mockMvc.get("/api/super-admin/audio") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(3) }
                jsonPath("$.limit") { value(50) }
                jsonPath("$.maxBytes") { value(5_242_880) }
                jsonPath("$.viewerIsAdmin") { value(true) }
            }
    }

    /**
     * `gate.global` is decided by one boolean that is always true here, and `AudioPoolContext` is a
     * data class -- so a handler that dropped the gate and inlined `AudioPoolContext(null, true)`
     * would satisfy every other assertion in this file by value equality. Only counting the calls
     * pins it.
     */
    @Test
    fun `every endpoint consults the gate`() {
        val id = UUID.fromString("22222222-2222-2222-2222-222222222222")
        val uploaded = AudioClipSummary(
            id = id, communityId = null, uploadedBy = TEST_USER_ID, fileName = "a.wav",
            channels = 1, sampleRate = 8_000, frames = 8_000, byteSize = 16_044,
            createdAt = Instant.EPOCH,
        )

        every { gate.global(true) } returns globalPool
        every { service.list(pool = globalPool, viewerId = TEST_USER_ID) } returns emptyList()
        every { service.count(globalPool) } returns 0L
        every { service.limitOf(globalPool) } returns 50
        every { service.maxBytes() } returns 5_242_880
        every {
            service.upload(pool = globalPool, uploaderId = TEST_USER_ID, fileName = any(), bytes = any())
        } returns uploaded
        every { service.wav(pool = globalPool, id = id, viewerId = TEST_USER_ID) } returns byteArrayOf(1)
        every { service.delete(pool = globalPool, id = id, viewerId = TEST_USER_ID) } returns Unit
        every { users.findAllById(emptyList()) } returns emptyList()
        every { users.findAllById(listOf(TEST_USER_ID)) } returns emptyList()

        val admin = principalFor(superAdmin = true)
        mockMvc.get("/api/super-admin/audio") { with(admin) }
        mockMvc.multipart("/api/super-admin/audio") {
            file(MockMultipartFile("file", "a.wav", "audio/wav", byteArrayOf(1)))
            with(admin); with(withCsrfToken())
        }
        mockMvc.get("/api/super-admin/audio/$id") { with(admin) }
        mockMvc.delete("/api/super-admin/audio/$id") { with(admin); with(withCsrfToken()) }

        verify(exactly = 4) { gate.global(true) }
    }

    /**
     * 403 here, not the 404 the community namespace answers with: the `/api/super-admin` tree is a
     * fixed, non-secret prefix that SecurityConfig refuses at the filter chain, before any handler
     * runs -- so naming the refusal reveals nothing, and the image pool's controller test asserts
     * the same. The 404 rule guards `/api/communities/{slug}/...`, where the status would
     * otherwise say whether that community exists.
     *
     * Every route is listed so the refusal is proven for all of them. Mutating requests carry a
     * CSRF token: without it the 403 would come from the wrong place and prove nothing.
     */
    @Test
    fun `a non-super-admin is refused on every route`() {
        val id = UUID.fromString("11111111-1111-1111-1111-111111111111")

        mockMvc.get("/api/super-admin/audio") { with(principalFor()) }
            .andExpect { status { isForbidden() } }

        mockMvc.get("/api/super-admin/audio/$id") { with(principalFor()) }
            .andExpect { status { isForbidden() } }

        mockMvc.multipart("/api/super-admin/audio") {
            file(MockMultipartFile("file", "a.wav", "audio/wav", byteArrayOf(1)))
            with(principalFor()); with(withCsrfToken())
        }.andExpect { status { isForbidden() } }

        mockMvc.delete("/api/super-admin/audio/$id") { with(principalFor()); with(withCsrfToken()) }
            .andExpect { status { isForbidden() } }
    }
}
