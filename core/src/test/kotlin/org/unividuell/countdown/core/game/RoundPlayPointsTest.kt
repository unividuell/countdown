package org.unividuell.countdown.core.game

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayPoints
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayPointsTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val communities: CommunityService,
    @Autowired val communityQuery: CommunityQuery,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val points = RoundPlayPoints(
        plays = plays, communities = communityQuery, engine = engine, clock = clock,
    )
    private val at = Instant.parse("2026-08-12T10:00:00Z")

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser()
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

    /** A finished, scored round: announce it, reveal, guess, and write the points directly. */
    private fun scored(community: Community, roundNumber: Int, user: UUID, points: Int) {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val round = store.find(edition = edition, roundNumber = roundNumber) ?: store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":1.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = at,
        )
        val roundId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = at)
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user))
        val playId = requireNotNull(play.id)
        plays.recordGuess(
            id = playId, guess = mapper.readTree("""{"hue":1.0}"""), guessedAt = at,
            qualifies = true, deviation = 0.0, outcome = null,
        )
        plays.save(requireNotNull(plays.findById(playId).orElse(null)).copy(points = points))
    }

    @Test
    fun `a community without any played round scores zero rather than nothing`() {
        val (community, owner) = aCommunity("Points Empty")

        val standings = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(owner),
        )

        standings[owner].shouldNotBeNull().stable shouldBe 0
        standings[owner]!!.live.shouldBeNull()
    }

    @Test
    fun `finished rounds are summed and the running one is not`() {
        val (community, owner) = aCommunity("Points Sum")
        val current = currentRoundNumberOf(community)
        // Larger number = earlier in time, so current + 1 and + 2 are finished rounds.
        scored(community = community, roundNumber = current + 1, user = owner, points = 3)
        scored(community = community, roundNumber = current + 2, user = owner, points = 4)
        scored(community = community, roundNumber = current, user = owner, points = 9)

        val standings = points.standings(
            communityId = requireNotNull(community.id), viewerId = owner, userIds = listOf(owner),
        )

        standings[owner].shouldNotBeNull().stable shouldBe 7
        // The running round is live, not stable — and visible because the viewer guessed it.
        standings[owner]!!.live shouldBe 9
    }

    @Test
    fun `live points stay hidden until the viewer has guessed the running round themselves`() {
        val (community, owner) = aCommunity("Points Live Gate")
        val communityId = requireNotNull(community.id)
        val other = aUser()
        val current = currentRoundNumberOf(community)
        scored(community = community, roundNumber = current, user = other, points = 5)

        val hidden = points.standings(communityId = communityId, viewerId = owner, userIds = listOf(other))
        scored(community = community, roundNumber = current, user = owner, points = 2)
        val shown = points.standings(communityId = communityId, viewerId = owner, userIds = listOf(other))

        hidden[other].shouldNotBeNull().live.shouldBeNull()
        shown[other].shouldNotBeNull().live shouldBe 5
    }

    @Test
    fun `shrinking the window drops rounds out of the sum but not out of the database`() {
        val (community, owner) = aCommunity("Points Window")
        val communityId = requireNotNull(community.id)
        val current = currentRoundNumberOf(community)
        scored(community = community, roundNumber = current + 1, user = owner, points = 3)
        scored(community = community, roundNumber = current + 2, user = owner, points = 4)
        val edition = requireNotNull(editions.findActiveByCommunityId(communityId))

        // The admin closes the window below the older round: it is no longer in play.
        editions.save(edition.copy(gamesFromRound = current + 1))
        val shrunk = points.standings(communityId = communityId, viewerId = owner, userIds = listOf(owner))
        // Re-opening brings the same number back, untouched: the points sit frozen on the row and
        // only their inclusion in the sum is dynamic.
        editions.save(
            requireNotNull(editions.findActiveByCommunityId(communityId)).copy(gamesFromRound = null),
        )
        val reopened = points.standings(communityId = communityId, viewerId = owner, userIds = listOf(owner))

        shrunk[owner].shouldNotBeNull().stable shouldBe 3
        reopened[owner].shouldNotBeNull().stable shouldBe 7
    }

    @Test
    fun `a run without a target date has no rounds and therefore no points`() {
        val ownerId = aUser()
        val community = communities.create(creatorUserId = ownerId, rawName = "Points No Date")

        val standings = points.standings(
            communityId = requireNotNull(community.id), viewerId = ownerId, userIds = listOf(ownerId),
        )

        standings[ownerId].shouldNotBeNull().stable shouldBe 0
    }
}
