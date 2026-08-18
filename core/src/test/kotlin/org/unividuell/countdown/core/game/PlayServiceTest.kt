package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldHaveSize
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
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AlreadyGuessedException
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.CurrentRound
import org.unividuell.countdown.core.game.internal.GuessHuePayload
import org.unividuell.countdown.core.game.internal.GuessHueSolution
import org.unividuell.countdown.core.game.internal.NotRevealedException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundMovedOnException
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlayServiceTest(
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
) {
    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun guess(hue: Double): JsonNode = mapper.readTree("""{"hue":$hue}""")

    /**
     * A community whose countdown starts in 2099 — so the current round is a large number — with its
     * creator as first ACTIVE member. [phaseTwo] shifts the threshold above the current round, which
     * is what puts the round into phase two, because later in time is a smaller number.
     */
    private fun aCommunity(name: String, phaseTwo: Boolean = false): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        if (phaseTwo) {
            val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
            editions.save(edition.copy(phaseTwoStartRound = currentRoundNumberOf(community) + 10))
        }
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

    /**
     * A second ACTIVE member, added directly through the repository: shorter than the
     * generate-invite / accept / approve round trip and this is a fixture, not the thing under test.
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

    @Test
    fun `the round payload names a player the way their community does`() {
        val (community, viewer) = aCommunity("Named Round")
        val member = requireNotNull(
            members.findByCommunityIdAndUserId(communityId = requireNotNull(community.id), userId = viewer),
        )
        members.save(member.copy(displayName = "Zwerg", bgColorHex = "#8e44ad"))

        val res = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val me = res.me.shouldNotBeNull()
        me.username shouldBe "Zwerg"
        me.avatar.shortName shouldBe "ZWRG"
        me.avatar.bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `revealing hands out the payload and starts the clock`() {
        val (community, viewer) = aCommunity("Reveal Round")

        val res = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val payload = res.payload.shouldNotBeNull() as GuessHuePayload
        payload.description.shouldNotBeNull()
        val me = res.me.shouldNotBeNull()
        me.revealedAt.shouldNotBeNull()
        me.guessedAt.shouldBeNull()
        // Before the guess: no solution, no other player's guess.
        res.solution.shouldBeNull()
        res.others.shouldBeEmpty()
    }

    @Test
    fun `revealing twice returns the same round and only counts up`() {
        val (community, viewer) = aCommunity("Reveal Twice")

        val first = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val second = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        second.payload shouldBe first.payload
        second.me.shouldNotBeNull().revealedAt shouldBe first.me.shouldNotBeNull().revealedAt
        val round = announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)
        plays.findByRoundGameId(
            requireNotNull((round as CurrentRound.Announced).roundGame.id),
        ).single().revealCount shouldBe 2
    }

    @Test
    fun `a game that does not ask for a deliberate reveal stays idempotent, and says so in the response`() {
        val (community, viewer) = aCommunity("Free Reveal")

        val first = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val again = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        first.game.shouldNotBeNull().requiresReveal shouldBe false
        again.me.shouldNotBeNull().revealedAt shouldBe first.me.shouldNotBeNull().revealedAt
    }

    @Test
    fun `the announcement hands out no payload before the reveal`() {
        val (community, viewer) = aCommunity("No Payload")

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.game.shouldNotBeNull()
        res.payload.shouldBeNull()
        res.me.shouldBeNull()
    }

    @Test
    fun `guessing without revealing is refused`() {
        val (community, viewer) = aCommunity("No Reveal")
        val roundNumber = announcements.currentRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        ).round.shouldNotBeNull().number

        shouldThrow<NotRevealedException> {
            play.guess(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, guess = guess(10.0),
            )
        }
    }

    @Test
    fun `a guess for a round that has moved on is refused, and nothing is written`() {
        // A tab left open across the day boundary would otherwise have its guess judged against a
        // round the player never saw — with a deviation that means nothing to them.
        val (community, viewer) = aCommunity("Stale Round")
        val current = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val staleNumber = requireNotNull(current.round).number + 1

        shouldThrow<RoundMovedOnException> {
            play.guess(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = staleNumber, guess = guess(10.0),
            )
        }

        announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
            .me.shouldNotBeNull().guessedAt.shouldBeNull()
    }

    @Test
    fun `the response carries the rule and the stake the round was frozen with`() {
        val (community, viewer) = aCommunity("Award Fields")

        val res = announcements.currentRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        )

        res.awardRule shouldBe AwardRule.ALL_QUALIFYING
        res.awardPoints shouldBe 1
    }

    @Test
    fun `a guess reveals the solution and scores the round`() {
        val (community, viewer) = aCommunity("Guess Round")
        val revealed = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val payload = revealed.payload as GuessHuePayload
        val roundNumber = revealed.round.shouldNotBeNull().number

        val res = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, guess = guess(payload.initHue),
        )

        val solution = res.solution.shouldNotBeNull() as GuessHueSolution
        solution.targetHue.shouldNotBeNull()
        val me = res.me.shouldNotBeNull()
        me.guessedAt.shouldNotBeNull()
        me.guess shouldBe guess(payload.initHue)
        // Points are written by the round's re-evaluation, in the same transaction as the guess.
        me.points.shouldNotBeNull()
    }

    @Test
    fun `an invalid guess consumes nothing and writes nothing`() {
        val (community, viewer) = aCommunity("Invalid Guess")
        val revealed = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val roundNumber = revealed.round.shouldNotBeNull().number

        shouldThrow<InvalidGuessException> {
            play.guess(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, guess = mapper.readTree("""{"hue":"warm"}"""),
            )
        }

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        res.me.shouldNotBeNull().guessedAt.shouldBeNull()
        res.solution.shouldBeNull()
    }

    @Test
    fun `a second guess is refused`() {
        val (community, viewer) = aCommunity("Second Guess")
        val revealed = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val roundNumber = revealed.round.shouldNotBeNull().number
        play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, guess = guess(10.0),
        )

        shouldThrow<AlreadyGuessedException> {
            play.guess(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, guess = guess(20.0),
            )
        }
    }

    @Test
    fun `the others' guesses appear only after one's own, and a revealed-but-unguessed lurker never does`() {
        val (community, owner) = aCommunity("Others Round")
        val other = aMember(community = community, login = "other")
        // Reveals but never guesses: the row it leaves behind is the one case that actually exercises
        // the `guessedAt != null` filter in `RoundResponses` — without a lurker, `others` would be
        // empty for the sole reason that nobody but the viewer had guessed yet, not because the filter
        // did anything.
        val lurker = aMember(community = community, login = "lurker")
        val otherRevealed = play.reveal(slug = community.slug, userId = other, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = other, isSuperAdmin = false,
            roundNumber = otherRevealed.round.shouldNotBeNull().number, guess = guess(30.0),
        )
        play.reveal(slug = community.slug, userId = lurker, isSuperAdmin = false)

        val before = play.reveal(slug = community.slug, userId = owner, isSuperAdmin = false)
        val after = play.guess(
            slug = community.slug, userId = owner, isSuperAdmin = false,
            roundNumber = before.round.shouldNotBeNull().number, guess = guess(40.0),
        )

        before.others.shouldBeEmpty()
        after.others shouldHaveSize 1
        after.others.single().userId shouldBe other
        after.others.single().guess shouldBe guess(30.0)
    }

    @Test
    fun `in phase two a better later guess takes the earlier best its points`() {
        val (community, owner) = aCommunity("Phase Two Round", phaseTwo = true)
        val other = aMember(community = community, login = "sniper")
        val ownerRevealed = play.reveal(slug = community.slug, userId = owner, isSuperAdmin = false)
        val solution = play.guess(
            slug = community.slug, userId = owner, isSuperAdmin = false,
            roundNumber = ownerRevealed.round.shouldNotBeNull().number, guess = guess(0.0),
        ).solution as GuessHueSolution
        // The owner scored: in phase two there is no gate, so the only guess so far is the best one.
        // awardFor in phase two is (threshold - round + 2), and the threshold sits 10 rounds above
        // the current one, so the stake is 12.
        announcements.currentRound(slug = community.slug, userId = owner, isSuperAdmin = false)
            .me.shouldNotBeNull().points shouldBe 12

        val otherRevealed = play.reveal(slug = community.slug, userId = other, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = other, isSuperAdmin = false,
            roundNumber = otherRevealed.round.shouldNotBeNull().number, guess = guess(solution.targetHue),
        )

        announcements.currentRound(slug = community.slug, userId = owner, isSuperAdmin = false)
            .me.shouldNotBeNull().points shouldBe 0
    }

    @Test
    fun `a super-admin who is not a member may not reveal`() {
        val (community, _) = aCommunity("Admin Reveal Round")
        val superAdmin = aUser("admin-reveal")

        shouldThrow<RoundAccessDeniedException> {
            play.reveal(slug = community.slug, userId = superAdmin, isSuperAdmin = true)
        }
    }

    @Test
    fun `a super-admin who is not a member may not guess`() {
        val (community, _) = aCommunity("Admin Guess Round")
        val superAdmin = aUser("admin-guess")
        // The admin bypass is a read-only privilege (see PlayService.playable) — loading the round
        // this way still works, but guessing does not, which is exactly what this test pins.
        val roundNumber = announcements.currentRound(
            slug = community.slug, userId = superAdmin, isSuperAdmin = true,
        ).round.shouldNotBeNull().number

        shouldThrow<RoundAccessDeniedException> {
            play.guess(
                slug = community.slug, userId = superAdmin, isSuperAdmin = true,
                roundNumber = roundNumber, guess = guess(10.0),
            )
        }
    }
}
