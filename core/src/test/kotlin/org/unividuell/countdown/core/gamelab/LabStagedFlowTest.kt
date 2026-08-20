package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.json.JsonMapper
import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
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
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.gamelab.internal.LabAssetForbiddenException
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import java.util.UUID

/**
 * `song-snippet`'s staged flow, replayed by the lab: `guessActionFor` decides whether a wrong guess
 * below the top stage advances (no entry recorded, the new stage rides the response) or records
 * terminally — the same pure function `PlayService.guess` applies to a real round. The asset gate
 * mirrors `PlayService.asset` the same way: a stage key opens once it is at or below the tester's own
 * stage, the solution key only once the tester has spent their one guess — guessing or giving up
 * either count.
 *
 * [SongSnippetTestCatalogConfiguration] keeps `song-snippet` off the network and off the empty pool
 * the test classpath's Deezer properties would otherwise leave it with — the same stub `LabServiceTest`
 * uses for the consolidation property.
 */
@Import(TestcontainersConfiguration::class, SongSnippetTestCatalogConfiguration::class)
@SpringBootTest
class LabStagedFlowTest(@Autowired val service: LabService) {

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val communityId = UUID.randomUUID()
    private val slug = "team"
    private val tester = UUID.randomUUID()
    private val mapper = JsonMapper.builder().build()

    /** The one member every test here needs — nobody else plays this round. */
    private fun aCommunityWithOneMember() {
        val community = Community(id = communityId, name = "Team", slug = slug, createdBy = UUID.randomUUID())
        every { communities.findBySlug(slug) } returns community
        every { memberships.isActiveMember(communityId = communityId, userId = tester) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()
    }

    @Test
    fun `the lab replays the staged flow - wrong below the top advances, stage rides the response`() {
        aCommunityWithOneMember()

        val opened = service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        opened.myStage shouldBe 0

        val afterWrong = service.guess(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
            guess = mapper.readTree("""{"artist":"x","title":"y"}"""),
        )

        afterWrong.myStage shouldBe 1
        // ADVANCE_STAGE only burns the stage — no entry is recorded for a wrong guess below the top.
        afterWrong.me.shouldBeNull()
    }

    @Test
    fun `lab assets follow the same gate - unlocked stages yes, above no, solution behind the spent guess`() {
        aCommunityWithOneMember()
        service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        service.asset(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, key = 0,
        ).mediaType shouldBe "audio/wav"

        shouldThrow<LabAssetForbiddenException> {
            service.asset(
                slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
                userId = tester, isSuperAdmin = false, key = 3,
            )
        }

        service.giveUp(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        service.asset(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, key = 99,
        ).mediaType shouldBe "audio/mpeg"
    }

    @Test
    fun `forgetting my guess resets my stage back to zero`() {
        aCommunityWithOneMember()
        service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        service.guess(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
            guess = mapper.readTree("""{"artist":"x","title":"y"}"""),
        ).myStage shouldBe 1

        val afterForget = service.forgetMine(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        // Otherwise a tester who deletes their guess would stand back in front of the gate at the
        // stage they had already burned through, unlocking assets a fresh replay has not earned yet.
        afterForget.myStage shouldBe 0
    }

    @Test
    fun `resetting the round puts every stage back to zero too`() {
        aCommunityWithOneMember()
        service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        service.guess(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
            guess = mapper.readTree("""{"artist":"x","title":"y"}"""),
        ).myStage shouldBe 1

        val afterReset = service.resetRound(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        afterReset.myStage shouldBe 0
    }
}
