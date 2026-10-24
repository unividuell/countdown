package org.unividuell.countdown.core.gamelab

import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.CountingGame
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.gamelab.internal.AlreadyGuessedException
import org.unividuell.countdown.core.gamelab.internal.LabService
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/** The lab's twin of `PlayServiceSpentGuessTest`: a spent guess is refused before the game judges it. */
@Import(TestcontainersConfiguration::class, CountingGame.Configuration::class)
@SpringBootTest
class LabSpentGuessTest(
    @Autowired val service: LabService,
    @Autowired val game: CountingGame,
) {

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val mapper = JsonMapper.builder().build()

    @Test
    fun `a second guess is refused without judging it`() {
        val communityId = UUID.randomUUID()
        val tester = UUID.randomUUID()
        every { communities.findBySlug("team") } returns
            Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId = communityId, userId = tester) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()
        service.guess(
            slug = "team", gameId = "counting-fake", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, guess = mapper.readTree("""{"answer":"42"}"""),
        )
        val judged = game.judged.get()

        shouldThrow<AlreadyGuessedException> {
            service.guess(
                slug = "team", gameId = "counting-fake", seed = 7, phase = Phase.ONE,
                userId = tester, isSuperAdmin = false, guess = mapper.readTree("""{"answer":"42"}"""),
            )
        }

        game.judged.get() shouldBe judged
    }
}
