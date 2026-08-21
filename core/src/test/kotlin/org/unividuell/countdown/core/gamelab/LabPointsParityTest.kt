package org.unividuell.countdown.core.gamelab

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
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
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.awardFor
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.CurrentRound
import org.unividuell.countdown.core.game.internal.GuessHueSolution
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The test that makes the consolidation worth its diff.
 *
 * The lab and the real round now share `awardFor` and `pointsFor`, so this cannot drift **as long as
 * nobody re-implements one of them locally** — and that is exactly the regression worth a test: a
 * future "small fix" in either place has to keep this equal.
 *
 * Both halves play the *first* round of phase two — the round for which the threshold sits directly on
 * the current round number, wherever that number itself comes from. That is the only way to compare a
 * calendar-derived round (the real half) against the lab's synthetic one: not by their round numbers,
 * which differ on purpose, but by the stake `awardFor` pays at that shared position, 2 points.
 *
 * A **sanctioned, test-only exception** to `gamelab → game`, never `game.internal`: unlike
 * `LabServiceTest`, this file imports `AnnouncementService`, `PlayService` and `GuessHueSolution`
 * straight from `game.internal`. Proving parity means driving the real round's own services and reading
 * its stored `points` — no exposed API produces either, and mocking them the way `LabServiceTest` mocks
 * `CommunityQuery`/`MembershipQuery`/`UserQuery` would defeat the point, since the real award path
 * *is* what this test exists to run. It stays test-only: `ModularityTests.verify()` scans production
 * sources, not tests, so the constraint this appears to break is a production constraint, and
 * production code keeps obeying it without exception. `LabServiceTest`'s way — mock the surrounding
 * modules, never reach into `game.internal` — remains the rule for lab tests generally; this file is
 * the one exception, because parity cannot be shown from one side alone.
 *
 * The real half's guess-hue shapes (`{"hue":...}`, [GuessHueSolution]) are hard-coded on purpose — this
 * is a parity test for `awardFor`/`pointsFor`, not a test of game selection — so [announceGuessHue]
 * pins the real half's round directly via [RoundGameStore.announce], the same documented pattern
 * [PlayServiceTest] uses, rather than letting the now two-game catalogue's selection choose.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class LabPointsParityTest(
    @Autowired val lab: LabService,
    @Autowired val play: PlayService,
    @Autowired val announcements: AnnouncementService,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val store: RoundGameStore,
    @Autowired val catalog: GameCatalog,
) {

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun guess(hue: Double): JsonNode = mapper.readTree("""{"hue":$hue}""")

    /**
     * A second ACTIVE member, added directly through the repository — shorter than the
     * generate-invite / accept / approve round trip, and this is a fixture, not the thing under test.
     * Mirrors `PlayServiceTest.aMember`.
     */
    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId, status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    /**
     * A community whose countdown starts in 2099 — so the current round is a large number — with its
     * creator as first ACTIVE member, and `phaseTwoStartRound` pinned to exactly that current round
     * number. Unlike `PlayServiceTest.aCommunity(phaseTwo = true)`, which sets the threshold ten rounds
     * above the current one, this pins it directly on top: the current round becomes phase two's
     * **first** round, the one `awardFor` pays least for. That is what makes its stake comparable to
     * the lab's own first-phase-two-round stake at all — both numbers are then "threshold minus current
     * round plus two", with the "minus current round" part cancelling out to zero on both sides.
     *
     * Returns the threshold alongside the community: rounds are a daily grid, so the round number "now"
     * is not necessarily the round number by the time the test plays through reveal/guess/resolve —
     * the caller must compare against *this* pinned threshold, not against whatever round happens to be
     * current later.
     */
    private fun aPhaseTwoCommunity(name: String): Triple<Community, UUID, Int> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        val communityId = requireNotNull(community.id)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(communityId))
        val currentRoundNumber = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        editions.save(edition.copy(phaseTwoStartRound = currentRoundNumber))
        return Triple(community, ownerId, currentRoundNumber)
    }

    /** Pins the community's current round to "guess-hue", bypassing GameSelection — see the class doc. */
    private fun announceGuessHue(community: Community, phaseTwoStartRound: Int?) {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        val phase = Phase.of(roundNumber = roundNumber, phaseTwoStartRound = phaseTwoStartRound)
        store.announce(
            edition = edition,
            roundNumber = roundNumber,
            gameType = "guess-hue",
            params = requireNotNull(catalog.handle("guess-hue")).draw(
                random = GameRandom.independent(SecureRandom()),
                context = RoundContext(roundNumber = roundNumber, phase = phase),
            ),
            award = awardFor(roundNumber = roundNumber, phaseTwoStartRound = phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
    }

    @Test
    fun `a lab round in phase two awards what a real round in phase two awards`() {
        // The number both halves must land on, pinned independently of either side's own machinery:
        // the first round of phase two pays 2, straight out of the function both sides call.
        awardFor(roundNumber = 12, phaseTwoStartRound = 12).points shouldBe 2

        // --- the lab half: two testers, phase two, the second guessing exactly the target ---------
        val labEarlyId = aUser("lab-early")
        val labCommunity = communities.create(creatorUserId = labEarlyId, rawName = "Lab Parity Round")
        val labLateId = aMember(community = labCommunity, login = "lab-late")

        val labFirstGuess = lab.guess(
            slug = labCommunity.slug, gameId = "guess-hue", seed = 42, phase = Phase.TWO,
            userId = labEarlyId, isSuperAdmin = false, guess = guess(0.0),
        )
        // Read the target off the response rather than guessing it, exactly like the real half below.
        val labTargetHue = (labFirstGuess.solution.shouldNotBeNull() as GuessHueSolution).targetHue

        val labSecondGuess = lab.guess(
            slug = labCommunity.slug, gameId = "guess-hue", seed = 42, phase = Phase.TWO,
            userId = labLateId, isSuperAdmin = false, guess = guess(labTargetHue),
        )
        val labWinnerPoints = labSecondGuess.me.shouldNotBeNull().points
        val labLoserPoints = labSecondGuess.others.single().points

        // --- the real half: same shape, on round_games/round_plays, threshold pinned to "now" -----
        val (realCommunity, realEarlyId, realThreshold) = aPhaseTwoCommunity("Real Parity Round")
        val realLateId = aMember(community = realCommunity, login = "real-late")
        announceGuessHue(community = realCommunity, phaseTwoStartRound = realThreshold)

        val realEarlyRevealed = play.reveal(
            slug = realCommunity.slug, userId = realEarlyId, isSuperAdmin = false,
        )
        val realRoundNumber = realEarlyRevealed.round.shouldNotBeNull().number
        val realFirstGuess = play.guess(
            slug = realCommunity.slug, userId = realEarlyId, isSuperAdmin = false,
            roundNumber = realRoundNumber, guess = guess(0.0),
        )
        val realTargetHue = (realFirstGuess.solution.shouldNotBeNull() as GuessHueSolution).targetHue

        play.reveal(slug = realCommunity.slug, userId = realLateId, isSuperAdmin = false)
        play.guess(
            slug = realCommunity.slug, userId = realLateId, isSuperAdmin = false,
            roundNumber = realRoundNumber, guess = guess(realTargetHue),
        )

        val resolved = announcements.resolve(
            slug = realCommunity.slug, userId = realEarlyId, isSuperAdmin = false,
        ) as CurrentRound.Announced
        val roundGameId = requireNotNull(resolved.roundGame.id)
        // Read through the repository, as PlayServiceTest does — not through the response DTO, which
        // this test does not otherwise touch, to keep the source of the real half's numbers explicit.
        val realRows = plays.findByRoundGameId(roundGameId).associateBy { it.userId }
        val realWinnerPoints = requireNotNull(realRows.getValue(realLateId).points)
        val realLoserPoints = requireNotNull(realRows.getValue(realEarlyId).points)

        // --- compare: same rule on both sides, and the same winner/loser split -------------------
        labSecondGuess.awardRule shouldBe AwardRule.CLOSEST_ONLY
        resolved.roundGame.awardRule shouldBe AwardRule.CLOSEST_ONLY

        labWinnerPoints shouldBe 2
        labLoserPoints shouldBe 0
        // Derived from the round the real half actually resolved to, not the literal 2: a day
        // boundary between pinning `realThreshold` and this `resolve()` call would move the current
        // round without anything being wrong, and a literal here would then fail for no reason.
        val realExpectedPoints = awardFor(
            roundNumber = resolved.roundGame.roundNumber, phaseTwoStartRound = realThreshold,
        ).points
        realWinnerPoints shouldBe realExpectedPoints
        realLoserPoints shouldBe 0
    }
}
