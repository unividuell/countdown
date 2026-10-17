package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.AssetForbiddenException
import org.unividuell.countdown.core.game.internal.AssetNotFoundException
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.NotRevealedException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundAssetStore
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The asset rule on a real round: `PlayService.asset` for the bytes, the round response for the
 * keys. [GatedGame] has three stages and one asset of every visibility.
 */
@Import(TestcontainersConfiguration::class, RoundAssetGateTest.GatedGame::class)
@SpringBootTest
@Transactional
class RoundAssetGateTest(
    @Autowired val play: PlayService,
    @Autowired val announcements: AnnouncementService,
    @Autowired val history: HistoryService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val assets: RoundAssetStore,
    @Autowired val catalog: GameCatalog,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class GatedGame {
        data class GatedParams(val answer: String)
        data class GatedPayload(val stages: Int) : GamePayload

        @Bean
        fun gatedGame(): GameType<GatedParams> = object : GameType<GatedParams> {
            override val id = "gated-fake"
            override val displayName = "Gattergestuft"
            override val paramsType = GatedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = GatedParams(answer = "42")
            override fun present(params: GatedParams) = GatedPayload(stages = 3)
            override fun judge(params: GatedParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("answer")?.asString() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun requiresReveal(params: GatedParams) = false
            override fun scoresOnDuration(params: GatedParams) = false
            override fun stages(params: GatedParams) = 3
            override fun produceAssets(params: GatedParams) = listOf(
                RoundAsset(name = "scene", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", bytes = byteArrayOf(98)),
                RoundAsset(name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav", bytes = byteArrayOf(0)),
                RoundAsset(name = "clip-1", visibility = AssetVisibility.FromStage(1), mediaType = "audio/wav", bytes = byteArrayOf(1)),
                RoundAsset(name = "solution", visibility = AssetVisibility.AfterGuess, mediaType = "audio/mpeg", bytes = byteArrayOf(99)),
            )
        }
    }

    private data class GatedRound(val number: Int, val id: UUID)

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id)

    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community to ownerId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** Announces [roundNumber] as `gated-fake` and stores its assets the way the materialiser does. */
    private fun announceGated(community: Community, roundNumber: Int): GatedRound {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val params = mapper.readTree("""{"answer":"42"}""")
        val id = requireNotNull(
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = "gated-fake", params = params,
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
            ).id,
        )
        val gatedGame = requireNotNull(catalog.handle("gated-fake"))
        assets.storeAll(roundGameId = id, assets = gatedGame.produceAssets(params).map { it.sealed() })
        return GatedRound(number = roundNumber, id = id)
    }

    /**
     * A community whose running round is `gated-fake`. The running round is announced on purpose:
     * `play.asset` resolves it, and resolving an un-announced round MATERIALISES it — which would let
     * the selection draw `song-snippet` and download a Deezer preview inside an asset test.
     */
    private fun aGatedRound(name: String): Triple<Community, UUID, GatedRound> {
        val (community, viewer) = aCommunity(name)
        return Triple(community, viewer, announceGated(community = community, roundNumber = currentRoundNumberOf(community)))
    }

    @Test
    fun `stage bytes are sealed and fetchable before the reveal`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Sealed")

        val asset = play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = round.number, roundGameId = round.id, name = "clip-1",
        )

        asset.bytes.size shouldBe 1 + 28
        AssetSeal.open(sealed = asset.bytes, key = asset.header.key!!) shouldBe byteArrayOf(1)
    }

    @Test
    fun `no key before the reveal, the stage-0 key with it`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Keys")

        announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
            .assetKeys shouldBe emptyMap()

        val revealed = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
        revealed.assetKeys.keys shouldBe setOf("clip-0")
        revealed.assetKeys.getValue("clip-0").mediaType shouldBe "audio/wav"
        revealed.roundGameId shouldBe round.id
    }

    @Test
    fun `a skip brings the next stage's key along`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Skip")
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)

        play.skip(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = round.number, fromStage = 0,
        ).assetKeys.keys shouldBe setOf("clip-0", "clip-1")
    }

    @Test
    fun `the scene asset opens before the reveal, without a play row`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Scene")

        val scene = play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = round.number, roundGameId = round.id, name = "scene",
        )

        scene.bytes shouldBe byteArrayOf(98)
        scene.header.key.shouldBeNull()
    }

    @Test
    fun `the after-guess asset needs a play row, then the spent guess`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Solution")
        val fetch = {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = round.number, roundGameId = round.id, name = "solution",
            )
        }

        shouldThrow<NotRevealedException> { fetch() }
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
        shouldThrow<AssetForbiddenException> { fetch() }
        play.giveUp(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
        fetch().bytes shouldBe byteArrayOf(99)
    }

    @Test
    fun `a wrong round id is not found, even under the right number`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Wrong Id")

        shouldThrow<AssetNotFoundException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = round.number, roundGameId = UUID.randomUUID(), name = "scene",
            )
        }
    }

    @Test
    fun `an unknown name is not found`() {
        val (community, viewer, round) = aGatedRound("Asset Gate Unknown Name")

        shouldThrow<AssetNotFoundException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = round.number, roundGameId = round.id, name = "clip-9",
            )
        }
    }

    @Test
    fun `a closed round hands out every key and its after-guess bytes`() {
        val (community, viewer, running) = aGatedRound("Asset Gate Closed")
        val past = announceGated(community = community, roundNumber = running.number + 1)

        // Never revealed, never guessed: whoever missed the round may still hear it afterwards.
        history.pastRound(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past.number)
            .assetKeys.keys shouldBe setOf("clip-0", "clip-1")
        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past.number, roundGameId = past.id, name = "solution",
        ).bytes shouldBe byteArrayOf(99)
    }

    @Test
    fun `a closed round's assets survive the window closing over them`() {
        val (community, viewer) = aCommunity("Asset Gate After Window")
        val past = announceGated(community = community, roundNumber = currentRoundNumberOf(community) + 1)
        // The run's window now ends one round before the running one, so the running round carries
        // no game at all (AFTER_WINDOW). The branch has to key off the round NUMBER — off „does the
        // running round carry a game“ it would take every reveal clip of the history down with it
        // on the day the event ends.
        //
        // No running round announced here, unlike the cases above: the window check runs BEFORE the
        // materialisation, so nothing can be drawn for the running round at all.
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        editions.save(edition.copy(gamesUntilRound = past.number))

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past.number, roundGameId = past.id, name = "solution",
        ).bytes shouldBe byteArrayOf(99)
    }
}
