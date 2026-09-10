package org.unividuell.countdown.core.imagepool

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.imagepool.internal.*
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminImageControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var gate: ImagePoolGate
    @MockkBean lateinit var service: ImagePoolService
    @MockkBean lateinit var users: UserQuery

    private val globalPool = PoolContext(communityId = null, viewerIsAdmin = true)

    @Test
    fun `a plain member cannot reach the global pool`() {
        mockMvc.get("/api/super-admin/images") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `a super-admin sees the global pool with its own limit`() {
        every { gate.global(true) } returns globalPool
        every { service.list(pool = globalPool, viewerId = TEST_USER_ID) } returns emptyList()
        every { service.count(globalPool) } returns 3L
        every { service.limitOf(globalPool) } returns 40
        every { users.findAllById(emptyList()) } returns emptyList()

        mockMvc.get("/api/super-admin/images") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(3) }
                jsonPath("$.limit") { value(40) }
            }
    }

    /**
     * `gate.global` is decided by one boolean that is always true here, and `PoolContext` is a
     * data class -- so a handler that dropped the gate and inlined `PoolContext(null, true)`
     * would satisfy every other assertion in this file by value equality. Only counting the
     * calls pins it. It matters because the gate is what makes this controller correct on its
     * own, rather than by grace of a rule in a security config it never mentions.
     */
    @Test
    fun `every endpoint consults the gate`() {
        val id = UUID.fromString("22222222-2222-2222-2222-222222222222")
        val uploaded = ImageSummary(
            id = id, communityId = null, uploadedBy = TEST_USER_ID,
            mediaType = "image/jpeg", width = 1, height = 1, byteSize = 1,
            createdAt = Instant.EPOCH,
        )

        every { gate.global(true) } returns globalPool
        every { service.list(pool = globalPool, viewerId = TEST_USER_ID) } returns emptyList()
        every { service.count(globalPool) } returns 0L
        every { service.limitOf(globalPool) } returns 40
        every { service.upload(pool = globalPool, uploaderId = TEST_USER_ID, bytes = any()) } returns uploaded
        every { service.thumb(pool = globalPool, id = id, viewerId = TEST_USER_ID) } returns byteArrayOf(1)
        every { service.original(pool = globalPool, id = id, viewerId = TEST_USER_ID) } returns
            ImageBytes(mediaType = "image/jpeg", bytes = byteArrayOf(1))
        every { service.delete(pool = globalPool, id = id, viewerId = TEST_USER_ID) } returns Unit
        every { users.findAllById(emptyList()) } returns emptyList()
        every { users.findAllById(listOf(TEST_USER_ID)) } returns emptyList()

        val admin = principalFor(superAdmin = true)
        mockMvc.get("/api/super-admin/images") { with(admin) }
        mockMvc.multipart("/api/super-admin/images") {
            file(MockMultipartFile("file", "a.jpg", "image/jpeg", byteArrayOf(1)))
            with(admin); with(csrf())
        }
        mockMvc.get("/api/super-admin/images/$id/thumb") { with(admin) }
        mockMvc.get("/api/super-admin/images/$id") { with(admin) }
        mockMvc.delete("/api/super-admin/images/$id") { with(admin); with(csrf()) }

        verify(exactly = 5) { gate.global(true) }
    }

    /**
     * 403 here, not the 404 the community namespace answers with. The `/api/super-admin` tree is a
     * fixed, non-secret prefix that SecurityConfig refuses at the filter chain, before any
     * handler runs -- so nothing is revealed by naming the refusal, and the three older
     * super-admin controllers assert the same. The 404 rule guards `/api/communities/{slug}/...`,
     * where the status would otherwise say whether that community exists.
     *
     * Every endpoint is listed so the refusal is proven for all of them, not just the listing.
     * Note what this does NOT prove: the refusal comes from the filter chain, so these four
     * requests never reach a handler and say nothing about whether it consults the gate. That
     * is `every endpoint consults the gate`'s job. Mutating requests carry csrf(): without it
     * the 403 would come from the wrong place and prove nothing.
     */
    @Test
    fun `no endpoint of the global pool answers a plain member`() {
        val id = UUID.fromString("11111111-1111-1111-1111-111111111111")

        mockMvc.get("/api/super-admin/images/$id/thumb") { with(principalFor()) }
            .andExpect { status { isForbidden() } }

        mockMvc.get("/api/super-admin/images/$id") { with(principalFor()) }
            .andExpect { status { isForbidden() } }

        mockMvc.multipart("/api/super-admin/images") {
            file(MockMultipartFile("file", "a.jpg", "image/jpeg", byteArrayOf(1)))
            with(principalFor()); with(csrf())
        }.andExpect { status { isForbidden() } }

        mockMvc.delete("/api/super-admin/images/$id") { with(principalFor()); with(csrf()) }
            .andExpect { status { isForbidden() } }
    }
}
