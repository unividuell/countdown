package org.unividuell.countdown.core.imagepool

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.imagepool.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class ImagePoolControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var gate: ImagePoolGate
    @MockkBean lateinit var service: ImagePoolService
    @MockkBean lateinit var users: UserQuery

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val imageId = UUID.fromString("018f0000-0000-7000-8000-0000000000e1")
    private val memberPool = PoolContext(communityId = communityId, viewerIsAdmin = false)

    private val summary = ImageSummary(
        id = imageId, communityId = communityId, uploadedBy = TEST_USER_ID,
        mediaType = "image/jpeg", width = 800, height = 600, byteSize = 4_500_000,
        createdAt = Instant.parse("2026-09-01T10:00:00Z"),
    )

    @Test
    fun `a non-member gets 404, never 403`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } throws ImagePoolAccessDeniedException()

        mockMvc.get("/api/communities/alpha/images") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `the listing carries the quota and the uploader's name, never bytes`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every { service.list(pool = memberPool, viewerId = TEST_USER_ID) } returns listOf(summary)
        every { service.count(memberPool) } returns 12L
        every { service.limitOf(memberPool) } returns 150
        every { users.findAllById(listOf(TEST_USER_ID)) } returns
            listOf(User(id = TEST_USER_ID, githubId = 1L, githubLogin = "alice"))

        mockMvc.get("/api/communities/alpha/images") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(12) }
                jsonPath("$.limit") { value(150) }
                // memberPool is not an admin's: the page uses this to drop the quota and the
                // uploader's name, both of which say nothing when you only see your own rows.
                jsonPath("$.viewerIsAdmin") { value(false) }
                jsonPath("$.images[0].id") { value(imageId.toString()) }
                jsonPath("$.images[0].uploadedBy") { value("alice") }
                jsonPath("$.images[0].byteSize") { value(4500000) }
                jsonPath("$.images[0].bytes") { doesNotExist() }
                jsonPath("$.images[0].thumbBytes") { doesNotExist() }
            }
    }

    @Test
    fun `a full pool answers 409 with a code the frontend can read`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every {
            service.upload(pool = memberPool, uploaderId = TEST_USER_ID, bytes = any())
        } throws PoolFullException(150)

        mockMvc.multipart("/api/communities/alpha/images") {
            file(MockMultipartFile("file", "a.jpg", "image/jpeg", byteArrayOf(1, 2, 3)))
            with(principalFor()); with(csrf())
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("POOL_FULL") }
        }
    }

    @Test
    fun `HEIC is refused by name`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every {
            service.upload(pool = memberPool, uploaderId = TEST_USER_ID, bytes = any())
        } throws HeicNotSupportedException()

        mockMvc.multipart("/api/communities/alpha/images") {
            file(MockMultipartFile("file", "a.heic", "image/heic", byteArrayOf(1, 2, 3)))
            with(principalFor()); with(csrf())
        }.andExpect {
            status { isUnsupportedMediaType() }
            jsonPath("$.code") { value("HEIC_UNSUPPORTED") }
        }
    }

    @Test
    fun `the thumbnail is a cacheable, private JPEG`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every {
            service.thumb(pool = memberPool, id = imageId, viewerId = TEST_USER_ID)
        } returns byteArrayOf(9, 9)

        mockMvc.get("/api/communities/alpha/images/$imageId/thumb") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                content { contentType(MediaType.IMAGE_JPEG) }
                header { string("Cache-Control", "private, max-age=31536000, immutable") }
            }
    }

    @Test
    fun `the original is served for viewing, not for downloading`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every {
            service.original(pool = memberPool, id = imageId, viewerId = TEST_USER_ID)
        } returns ImageBytes(mediaType = "image/png", bytes = byteArrayOf(1))

        mockMvc.get("/api/communities/alpha/images/$imageId") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                content { contentType(MediaType.IMAGE_PNG) }
                // A new tab must display it; Content-Disposition would make the browser save it.
                header { doesNotExist("Content-Disposition") }
            }
    }

    @Test
    fun `deleting answers 204`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every {
            service.delete(pool = memberPool, id = imageId, viewerId = TEST_USER_ID)
        } returns Unit

        mockMvc.delete("/api/communities/alpha/images/$imageId") { with(principalFor()); with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `a listed image appears with question mark when its uploader row is gone`() {
        every {
            gate.forCommunity(slug = "alpha", userId = TEST_USER_ID, isSuperAdmin = false)
        } returns memberPool
        every { service.list(pool = memberPool, viewerId = TEST_USER_ID) } returns listOf(summary)
        every { service.count(memberPool) } returns 1L
        every { service.limitOf(memberPool) } returns 150
        // Return an empty list: the uploader exists in the image summary but not in the user query result.
        every { users.findAllById(listOf(TEST_USER_ID)) } returns emptyList()

        mockMvc.get("/api/communities/alpha/images") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(1) }
                jsonPath("$.limit") { value(150) }
                jsonPath("$.images[0].id") { value(imageId.toString()) }
                // The uploader's row is gone, but the image still appears with a placeholder name.
                jsonPath("$.images[0].uploadedBy") { value("?") }
                jsonPath("$.images") { isArray() }
            }
    }
}
