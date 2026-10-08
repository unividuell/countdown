package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.matchers.nulls.shouldBeNull
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
import org.unividuell.countdown.core.game.internal.DedusterParams
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import tools.jackson.databind.ObjectMapper
import java.awt.image.BufferedImage
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlayServiceDedusterTest(
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

    private val image = UUID.fromString("0190f1b2-0000-7000-8000-00000000da7a")

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id)

    private fun aCommunity(): Pair<Community, UUID> {
        val owner = aUser("owner")
        val community = communities.create(creatorUserId = owner, rawName = "Entstauber Flow")
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val player = aUser("player")
        members.save(
            CommunityMember(communityId = requireNotNull(community.id), userId = player, status = MemberStatus.ACTIVE),
        )
        return community to player
    }

    private fun roundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(), startsAt = requireNotNull(edition.startsAt), zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** One real Entstauber round, announced and materialised with its photo. */
    private fun announced(community: Community): Pair<Int, DedusterParams> {
        every { pool.candidateIds(any()) } returns listOf(image)
        every { pool.displaySize(image) } returns ImageSize(width = 400, height = 300)
        every { pool.displayed(id = image, minShortEdge = any()) } returns BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)

        val handle = catalog.handle("deduster").shouldNotBeNull()
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val number = roundNumberOf(community)
        val params = handle.draw(
            random = GameRandom.fromSeed(4711),
            context = RoundContext(communityId = requireNotNull(community.id), roundNumber = number, phase = Phase.ONE),
        )
        val round = store.announce(
            edition = edition, roundNumber = number, gameType = "deduster", params = params,
            award = Award(rule = AwardRule.CLOSEST_ONLY, points = 3), announcedAt = clock.instant(),
        )
        handle.materialised(params = params, roundGameId = requireNotNull(round.id))
        return number to mapper.treeToValue(params, DedusterParams::class.java)
    }

    @Test
    fun `the photo is there before the reveal, the order only after it`() {
        val (community, player) = aCommunity()
        val (number, _) = announced(community)

        play.asset(
            slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = SCENE_ASSET_KEY,
        ).mediaType shouldBe "image/jpeg"

        val revealed = play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)
        mapper.valueToTree<tools.jackson.databind.JsonNode>(revealed.scene).propertyNames().toSet() shouldBe
            setOf("cols", "rows", "intervalMs")
        revealed.payload.shouldNotBeNull()
    }

    @Test
    fun `a finished run is stored with its average, and no duration is published`() {
        val (community, player) = aCommunity()
        val (number, params) = announced(community)
        play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)

        val reactions = List(params.cols * params.rows) { 400 }
        val response = play.guess(
            slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"reactionsMs":$reactions,"endedBy":"COMPLETE"}"""),
        )

        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(store.find(edition = edition, roundNumber = number)?.id), userId = player,
        ).shouldNotBeNull()
        row.deviation shouldBe 400.0
        row.qualifies shouldBe true
        response.me.shouldNotBeNull().durationMs.shouldBeNull()
        response.game.shouldNotBeNull().scoresOnDuration shouldBe false
    }

    /** 48 beats claimed, handed in at once: the server's own span from the reveal says otherwise. */
    @Test
    fun `a run that reaches the server before it could have ended is marked, and the row says why`() {
        val (community, player) = aCommunity()
        val (number, params) = announced(community)
        play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)

        val reactions = List(params.cols * params.rows) { 400 }
        play.guess(
            slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"reactionsMs":$reactions,"endedBy":"COMPLETE"}"""),
        )

        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(store.find(edition = edition, roundNumber = number)?.id), userId = player,
        ).shouldNotBeNull()
        row.outcome.shouldNotBeNull().get("implausible") shouldBe mapper.readTree("""["SUBMITTED_BEFORE_RUN_END"]""")
        row.qualifies shouldBe true
    }
}
