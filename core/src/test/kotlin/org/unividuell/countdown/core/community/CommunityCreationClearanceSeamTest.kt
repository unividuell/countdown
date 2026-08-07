package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.SuperAdminUserService
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.principalFor
import java.util.UUID

/**
 * Proves that the id `CommunityController` asks about is the id `UserQuery` answers for.
 *
 * `CommunityControllerTest` mocks the port and `UserQueryServiceTest` exercises it against the
 * database, so a wrong-id gate would pass both while opening creation to everyone or to nobody.
 * Here the port and the database are real, and the principal is built from the *saved* row — so
 * the principal's id and the row's id are the same by construction, not by a shared constant.
 *
 * `CommunityService` is mocked: what a created community looks like is not part of this seam.
 * `test-auth.enabled=false` keeps the seeded Futurama users out of the context.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = ["app.test-auth.enabled=false"])
class CommunityCreationClearanceSeamTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val users: UserRepository,
    @Autowired val superAdminUsers: SuperAdminUserService,
) {
    @MockkBean lateinit var communityService: CommunityService

    private fun save(login: String) =
        users.save(User(githubId = login.hashCode().toLong(), githubLogin = login))

    private fun createAs(user: User) =
        mockMvc.post("/api/communities") {
            with(principalFor(user)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }

    @Test
    fun `granting the clearance turns the same caller's 403 into a 201`() {
        val user = save("octocat")
        every { communityService.create(user.id!!, "Team A") } returns
            Community(id = UUID.randomUUID(), name = "Team A", slug = "team-a", createdBy = user.id!!)

        createAs(user).andExpect {
            status { isForbidden() }
            // Tells this 403 apart from the CSRF filter's, which never reaches authorization.
            jsonPath("$.detail") { value("Not allowed to create communities") }
        }

        superAdminUsers.setCommunityCreation(user.id!!, allowed = true)

        createAs(user).andExpect {
            status { isCreated() }
            jsonPath("$.slug") { value("team-a") }
        }
    }

    @Test
    fun `a clearance granted to another user does not create for this one`() {
        val cleared = save("cleared")
        val uncleared = save("uncleared")
        superAdminUsers.setCommunityCreation(cleared.id!!, allowed = true)

        createAs(uncleared).andExpect { status { isForbidden() } }
    }
}
