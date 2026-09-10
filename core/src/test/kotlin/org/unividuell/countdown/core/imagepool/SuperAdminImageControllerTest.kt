package org.unividuell.countdown.core.imagepool

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
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
     * 403 here, not the 404 the community namespace answers with. The `/api/super-admin` tree is a
     * fixed, non-secret prefix that SecurityConfig refuses at the filter chain, before any
     * handler runs -- so nothing is revealed by naming the refusal, and the three older
     * super-admin controllers assert the same. The 404 rule guards `/api/communities/{slug}/...`,
     * where the status would otherwise say whether that community exists.
     *
     * Every endpoint is listed because testing only the listing would leave one that forgot its
     * gate -- upload above all -- unguarded with nothing to notice. Mutating requests carry
     * csrf(): without it the 403 would come from the wrong place and prove nothing.
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
