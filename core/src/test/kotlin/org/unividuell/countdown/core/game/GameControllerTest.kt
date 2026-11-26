package org.unividuell.countdown.core.game

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.test.withCsrfToken
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GameControllerTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val catalog: GameCatalog,
    @Autowired val users: UserRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val members: CommunityMemberRepository,
) {
    private fun aUser(superAdmin: Boolean = false): User =
        users.save(User(subject = System.nanoTime().toString(), githubLogin = "u", isSuperAdmin = superAdmin))

    private val admin = aUser()
    private val member = aUser()
    private val slug = "games${System.nanoTime()}"

    init {
        val community = communities.save(Community(name = slug, slug = slug, createdBy = requireNotNull(admin.id)))
        listOf(admin to true, member to false).forEach { (user, isAdmin) ->
            members.save(
                CommunityMember(
                    communityId = requireNotNull(community.id), userId = requireNotNull(user.id),
                    status = MemberStatus.ACTIVE, isAdmin = isAdmin,
                ),
            )
        }
    }

    private fun putWeights(user: User, body: String) =
        mockMvc.put("/api/communities/$slug/games/weights") {
            with(principalFor(user))
            with(withCsrfToken())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private val first get() = catalog.ids()[0]

    @Test
    fun `a member sees every game, normal by default, sorted by name`() {
        val names = catalog.ids().map { requireNotNull(catalog.handle(it)).displayName }.sorted()

        mockMvc.get("/api/communities/$slug/games") { with(principalFor(member)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(names.size) }
                jsonPath("$[0].displayName") { value(names.first()) }
                jsonPath("$[*].weight") { value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.`is`("NORMAL"))) }
            }
    }

    @Test
    fun `a non-member gets 404`() {
        mockMvc.get("/api/communities/$slug/games") { with(principalFor(aUser())) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `an admin's weights show up, and normal resets them`() {
        putWeights(admin, """{"$first":"OFTEN"}""").andExpect { status { isNoContent() } }

        mockMvc.get("/api/communities/$slug/games") { with(principalFor(member)) }
            .andExpect { jsonPath("$[?(@.id == '$first')].weight") { value("OFTEN") } }

        putWeights(admin, """{"$first":"NORMAL"}""").andExpect { status { isNoContent() } }

        mockMvc.get("/api/communities/$slug/games") { with(principalFor(member)) }
            .andExpect { jsonPath("$[?(@.id == '$first')].weight") { value("NORMAL") } }
    }

    @Test
    fun `a member who is not admin gets 403`() {
        putWeights(member, """{"$first":"OFF"}""").andExpect { status { isForbidden() } }
    }

    @Test
    fun `a super-admin who is not a member may set weights`() {
        putWeights(aUser(superAdmin = true), """{"$first":"RARE"}""").andExpect { status { isNoContent() } }
    }

    @Test
    fun `an unknown game is refused`() {
        putWeights(admin, """{"no-such-game":"OFF"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `switching every game off is refused`() {
        val allOff = catalog.ids().joinToString(prefix = "{", postfix = "}") { "\"$it\":\"OFF\"" }

        putWeights(admin, allOff).andExpect { status { isBadRequest() } }
    }
}
