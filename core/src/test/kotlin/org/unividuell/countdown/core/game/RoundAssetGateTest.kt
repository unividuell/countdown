package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
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
import org.unividuell.countdown.core.game.internal.AssetForbiddenException
import org.unividuell.countdown.core.game.internal.AssetNotFoundException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The stage- and solution-gate on `PlayService.asset` (and, through it, the controller endpoint):
 * unlocked stages stay fetchable, a key above the caller's stage is forbidden before the game is ever
 * asked, and the solution key opens only once the guess is spent. [GatedGame] serves exactly
 * `key == 0` and [SOLUTION_ASSET_KEY] — every other in-range key is a stored miss, so the 404 branch
 * is exercised without pretending every stage carries an asset.
 */
@Import(TestcontainersConfiguration::class, RoundAssetGateTest.GatedGame::class)
@SpringBootTest
@Transactional
class RoundAssetGateTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class GatedGame {
        data class GatedParams(val answer: String)
        data class GatedPayload(val stages: Int) : GamePayload

        /** Five stages; serves only `key == 0` and [SOLUTION_ASSET_KEY] — every other key is a stored miss. */
        @Bean
        fun gatedGame(): GameType<GatedParams> = object : GameType<GatedParams> {
            override val id = "gated-fake"
            override val displayName = "Gattergestuft"
            override val paramsType = GatedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = GatedParams(answer = "42")
            override fun present(params: GatedParams) = GatedPayload(stages = 5)
            override fun judge(params: GatedParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("answer")?.asString() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun requiresReveal(params: GatedParams) = false
            override fun stages(params: GatedParams) = 5
            override fun asset(params: GatedParams, roundGameId: UUID, key: Int): RoundAsset? =
                when (key) {
                    0 -> RoundAsset(mediaType = "audio/wav", bytes = byteArrayOf(0))
                    SOLUTION_ASSET_KEY -> RoundAsset(mediaType = "audio/mpeg", bytes = byteArrayOf(99))
                    else -> null
                }
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

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

    /** Announces the current round as "gated-fake" with answer "42". */
    private fun announceGated(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        store.announce(
            edition = edition, roundNumber = roundNumber,
            gameType = "gated-fake", params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
        return roundNumber
    }

    @Test
    fun `a player may fetch every unlocked stage and nothing above`() {
        val (community, viewer) = aCommunity("Asset Gate Stage")
        val roundNumber = announceGated(community)
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        play.skip(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, fromStage = 0,
        )

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, key = 0,
        ).bytes shouldBe byteArrayOf(0)
        shouldThrow<AssetForbiddenException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, key = 2,
            )
        }
    }

    @Test
    fun `the solution asset opens with the spent guess, not before`() {
        val (community, viewer) = aCommunity("Asset Gate Solution")
        val roundNumber = announceGated(community)
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        shouldThrow<AssetForbiddenException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, key = SOLUTION_ASSET_KEY,
            )
        }

        play.giveUp(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = roundNumber)

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, key = SOLUTION_ASSET_KEY,
        ).mediaType shouldBe "audio/mpeg"
    }

    @Test
    fun `an unfilled key inside the allowed range is a 404, and a newer round is unknown`() {
        val (community, viewer) = aCommunity("Asset Gate Not Found")
        val roundNumber = announceGated(community)
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        play.skip(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, fromStage = 0,
        )

        shouldThrow<AssetNotFoundException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, key = 1,
            )
        }
        // A SMALLER number is later in time: a round that has not happened is no round at all.
        shouldThrow<RoundNotFoundException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber - 1, key = 0,
            )
        }
    }

    @Test
    fun `a closed round's assets are open, without a play row and above every stage`() {
        val (community, viewer) = aCommunity("Asset Gate Closed")
        // The running round is announced first on purpose: `play.asset` resolves it, and resolving
        // an un-announced round MATERIALISES it — which would let the selection draw `song-snippet`
        // and download a Deezer preview inside an asset test.
        announceGated(community)
        val past = currentRoundNumberOf(community) + 1
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = past, gameType = "gated-fake",
            params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        // Never revealed, never guessed: whoever missed the round may still hear it afterwards.
        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past, key = 0,
        ).bytes shouldBe byteArrayOf(0)
        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past, key = SOLUTION_ASSET_KEY,
        ).mediaType shouldBe "audio/mpeg"
    }

    @Test
    fun `a closed round's assets survive the window closing over them`() {
        val (community, viewer) = aCommunity("Asset Gate After Window")
        val past = currentRoundNumberOf(community) + 1
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = past, gameType = "gated-fake",
            params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
        // The run's window now ends one round before the running one, so the running round carries
        // no game at all (AFTER_WINDOW). The branch has to key off the round NUMBER — off „does the
        // running round carry a game“ it would take every reveal clip of the history down with it
        // on the day the event ends.
        //
        // No `announceGated` needed here, unlike the case above: the window check runs BEFORE the
        // materialisation, so nothing can be drawn for the running round at all.
        editions.save(edition.copy(gamesUntilRound = past))

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = past, key = SOLUTION_ASSET_KEY,
        ).mediaType shouldBe "audio/mpeg"
    }
}
