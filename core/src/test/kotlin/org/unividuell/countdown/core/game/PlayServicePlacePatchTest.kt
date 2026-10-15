package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AssetForbiddenException
import org.unividuell.countdown.core.game.internal.NotRevealedException
import org.unividuell.countdown.core.game.internal.PlacePatchParams
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import tools.jackson.databind.ObjectMapper
import java.awt.Color
import java.awt.image.BufferedImage
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlayServicePlacePatchTest(
    @Autowired val play: PlayService,
    @Autowired val catalog: GameCatalog,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @MockkBean lateinit var pool: ImagePoolQuery

    private val image = UUID.fromString("0190f1b2-0000-7000-8000-0000000071ac")

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id)

    private fun aMember(community: Community, login: String): UUID {
        val user = aUser(login)
        members.save(CommunityMember(communityId = requireNotNull(community.id), userId = user, status = MemberStatus.ACTIVE))
        return user
    }

    private fun aCommunity(): Community {
        val community = communities.create(creatorUserId = aUser("owner"), rawName = "Platzierung Flow")
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community
    }

    private fun roundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(), startsAt = requireNotNull(edition.startsAt), zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** One real, timed Platzierung round, announced and materialised with its photo. */
    private fun announced(community: Community): Pair<Int, PlacePatchParams> {
        val photo = BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)
        photo.createGraphics().apply { color = Color.ORANGE; fillRect(0, 0, 200, 300); dispose() }
        every { pool.candidateIds(any()) } returns listOf(image)
        every { pool.displaySize(image) } returns ImageSize(width = 400, height = 300)
        every { pool.displayed(id = image, minShortEdge = any()) } returns photo

        val handle = catalog.handle("place-patch").shouldNotBeNull()
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val number = roundNumberOf(community)
        val params = handle.draw(
            random = GameRandom.fromSeed(4711),
            context = RoundContext(communityId = requireNotNull(community.id), roundNumber = number, phase = Phase.TWO),
        )
        val round = store.announce(
            edition = edition, roundNumber = number, gameType = "place-patch", params = params,
            award = Award(rule = AwardRule.CLOSEST_ONLY, points = 3), announcedAt = clock.instant(),
        )
        handle.materialised(params = params, roundGameId = requireNotNull(round.id))
        return number to mapper.treeToValue(params, PlacePatchParams::class.java)
    }

    @Test
    fun `board and patch open with the one reveal, and only then`() {
        val community = aCommunity()
        val player = aMember(community = community, login = "player")
        val (number, _) = announced(community)

        shouldThrow<NotRevealedException> {
            play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 0)
        }

        val revealed = play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)
        mapper.valueToTree<tools.jackson.databind.JsonNode>(revealed.scene).propertyNames().toSet() shouldBe
            setOf("cols", "rows")

        play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 0)
            .mediaType shouldBe "image/jpeg"
        play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 1)
            .mediaType shouldBe "image/png"
        shouldThrow<AssetForbiddenException> {
            play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 2)
        }
    }

    @Test
    fun `the exact cell qualifies, one off does not, and the duration is published`() {
        val community = aCommunity()
        val hitter = aMember(community = community, login = "hitter")
        val misser = aMember(community = community, login = "misser")
        val (number, params) = announced(community)
        val offX = if (params.x == 0) 1 else params.x - 1

        play.reveal(slug = community.slug, userId = hitter, isSuperAdmin = false)
        val hit = play.guess(
            slug = community.slug, userId = hitter, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"x":${params.x},"y":${params.y}}"""),
        )
        play.reveal(slug = community.slug, userId = misser, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = misser, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"x":$offX,"y":${params.y}}"""),
        )

        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundGameId = requireNotNull(store.find(edition = edition, roundNumber = number)?.id)
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = hitter).shouldNotBeNull().qualifies shouldBe true
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = misser).shouldNotBeNull().qualifies shouldBe false
        hit.me.shouldNotBeNull().durationMs.shouldNotBeNull()
    }
}
