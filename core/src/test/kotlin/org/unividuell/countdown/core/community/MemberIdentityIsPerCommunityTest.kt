package org.unividuell.countdown.core.community

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.RosterService
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import java.time.Instant
import java.util.UUID

/**
 * The feature, once and whole: one person, two communities, an override in exactly one of them.
 *
 * Against the real database on purpose. Every other test of this rule hands the repository its
 * answer, and a lookup by user alone — the one mistake that would leak the nickname from A into B —
 * satisfies all of those mocks. Only a second community with rows of its own can tell the two
 * implementations apart.
 *
 * `play.reveal` below goes through the real materialisation, which may draw `song-snippet` just as
 * well as `guess-hue` — this test only reads the viewer's identity off the response, not the game's
 * payload, so [SongSnippetTestCatalogConfiguration] is imported purely to keep that draw from
 * reaching the network or an empty pool, not to steer which game wins.
 */
@Import(TestcontainersConfiguration::class, SongSnippetTestCatalogConfiguration::class)
@SpringBootTest
@Transactional
class MemberIdentityIsPerCommunityTest(
    @Autowired val identities: MemberIdentityQuery,
    @Autowired val roster: RosterService,
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    /** "AMY WONG" loses its vowels and its space before it is cut to four. */
    private val global = Avatar(shortName = "MYWN", bgColorHex = "#123456")
    private val globalName = "Amy Wong"
    private val nick = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad")
    private val nickname = "Zwerg"

    private lateinit var viewer: UUID
    private lateinit var withOverride: Community
    private lateinit var without: Community

    /**
     * Both communities are created by the same person, which makes them a member of both. The
     * countdown starts in 2099 so a round exists to reveal — `PlayServiceTest` builds its worlds
     * the same way.
     */
    private fun aCommunity(name: String): Community {
        val community = communities.create(creatorUserId = viewer, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community
    }

    private fun setUpTwoCommunities() {
        viewer = requireNotNull(
            users.save(
                User(
                    githubId = System.nanoTime(), githubLogin = "amy",
                    displayName = globalName, bgColorHex = global.bgColorHex,
                ),
            ).id,
        )
        withOverride = aCommunity("Nickname Here")
        without = aCommunity("Global Name There")

        val row = requireNotNull(
            members.findByCommunityIdAndUserId(communityId = idOf(withOverride), userId = viewer),
        )
        members.save(row.copy(displayName = nickname, bgColorHex = nick.bgColorHex))
    }

    private fun idOf(community: Community): UUID = requireNotNull(community.id)

    @Test
    fun `the port answers the override here and the global identity there`() {
        setUpTwoCommunities()

        val here = identities.of(communityId = idOf(withOverride), userId = viewer).shouldNotBeNull()
        val there = identities.of(communityId = idOf(without), userId = viewer).shouldNotBeNull()

        here.username shouldBe nickname
        here.avatar shouldBe nick
        there.username shouldBe globalName
        there.avatar shouldBe global
        here shouldNotBe there
    }

    @Test
    fun `the batch lookup is scoped to the community it was asked about`() {
        setUpTwoCommunities()

        val here = identities.of(communityId = idOf(withOverride), userIds = listOf(viewer))
        val there = identities.of(communityId = idOf(without), userIds = listOf(viewer))

        here[viewer].shouldNotBeNull().username shouldBe nickname
        there[viewer].shouldNotBeNull().username shouldBe globalName
    }

    @Test
    fun `the roster shows the nickname in one community and the global name in the other`() {
        setUpTwoCommunities()

        val here = roster.of(communityId = idOf(withOverride), viewerId = viewer).single()
        val there = roster.of(communityId = idOf(without), viewerId = viewer).single()

        here.fullName shouldBe nickname
        here.shortName shouldBe nick.shortName
        here.bgColorHex shouldBe nick.bgColorHex
        there.fullName shouldBe globalName
        there.shortName shouldBe global.shortName
        there.bgColorHex shouldBe global.bgColorHex
    }

    @Test
    fun `the round answer names the same player differently in each community`() {
        setUpTwoCommunities()

        val here = play.reveal(slug = withOverride.slug, userId = viewer, isSuperAdmin = false)
        val there = play.reveal(slug = without.slug, userId = viewer, isSuperAdmin = false)

        val mineHere = here.me.shouldNotBeNull()
        val mineThere = there.me.shouldNotBeNull()
        mineHere.username shouldBe nickname
        mineHere.avatar shouldBe nick
        mineThere.username shouldBe globalName
        mineThere.avatar shouldBe global
    }
}
