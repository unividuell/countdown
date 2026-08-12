package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.ints.shouldBeGreaterThan
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
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.EditionService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
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
class AnnouncementServiceTest(
    @Autowired val announcements: AnnouncementService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: EditionService,
    @Autowired val editionRepository: CommunityEditionRepository,
    @Autowired val rounds: RoundGameRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val mapper: ObjectMapper,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    /**
     * A community whose countdown starts far in the future, so the current round is a large number.
     * Its creator is automatically its first ACTIVE member (`CommunityService.create`), so the
     * returned UUID is a valid viewer without fetching one from a second, unrelated community.
     */
    private fun aCommunityWithOwner(
        name: String,
        gamesFromRound: Int? = null,
        gamesUntilRound: Int? = null,
    ): Pair<Community, UUID> {
        val owner = aUser()
        val ownerId = requireNotNull(owner.id)
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = gamesFromRound, gamesUntilRound = gamesUntilRound,
        )
        return community to ownerId
    }

    /**
     * The round number `currentRound` will resolve for [community] — computed the same way the
     * service computes it, from the same `CountdownEngine` and `Clock` beans, so a pre-inserted row
     * lands on the exact round the service is about to look at rather than a guessed number.
     */
    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editionRepository.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    @Test
    fun `a non-member gets no announcement at all`() {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = "Members Only Round")
        val outsider = aUser()

        shouldThrow<RoundAccessDeniedException> {
            announcements.currentRound(
                slug = community.slug, userId = requireNotNull(outsider.id), isSuperAdmin = false,
            )
        }
    }

    @Test
    fun `a super-admin may look without being a member`() {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = "Super Round")
        val superAdmin = aUser()

        val res = announcements.currentRound(
            slug = community.slug, userId = requireNotNull(superAdmin.id), isSuperAdmin = true,
        )

        res.noGameReason shouldBe NoGameReason.NOT_SCHEDULED
    }

    @Test
    fun `without a date there is no round and no game`() {
        val owner = aUser()
        val community = communities.create(creatorUserId = requireNotNull(owner.id), rawName = "No Date Round")

        val res = announcements.currentRound(
            slug = community.slug, userId = requireNotNull(owner.id), isSuperAdmin = false,
        )

        res.round.shouldBeNull()
        res.game.shouldBeNull()
        res.noGameReason shouldBe NoGameReason.NOT_SCHEDULED
    }

    @Test
    fun `the current round is announced with a game`() {
        val (community, viewer) = aCommunityWithOwner("Announced Round")

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        // With a target date in 2099, the current round number is far above zero.
        res.round.shouldNotBeNull().number shouldBeGreaterThan 0
        res.game.shouldNotBeNull().id shouldBe "guess-hue"
        res.game!!.displayName shouldBe "Farbausmalung"
        res.noGameReason.shouldBeNull()
    }

    @Test
    fun `announcing twice returns the same game - the round is materialised once`() {
        val (community, viewer) = aCommunityWithOwner("Stable Round")

        val first = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val second = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        second.game shouldBe first.game
        second.round shouldBe first.round
    }

    @Test
    fun `a round before the window has no game but still has a round`() {
        // The current round is a large number (the date is in 2099); a window that starts later in
        // time — a smaller number — has not begun yet.
        val (community, viewer) = aCommunityWithOwner("Before Window", gamesFromRound = 5, gamesUntilRound = 0)

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.round.shouldNotBeNull()
        res.game.shouldBeNull()
        res.noGameReason shouldBe NoGameReason.BEFORE_WINDOW
    }

    @Test
    fun `a round after the window has no game either`() {
        val (community, viewer) = aCommunityWithOwner("After Window")
        val edition = requireNotNull(editionRepository.findActiveByCommunityId(requireNotNull(community.id)))
        val current = announcements.currentRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
        ).round
        // Close the window entirely above the current round: until > current means it already ended.
        editionRepository.save(
            edition.copy(gamesFromRound = null, gamesUntilRound = requireNotNull(current).number + 5),
        )

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.noGameReason shouldBe NoGameReason.AFTER_WINDOW
    }

    @Test
    fun `announcing the same round twice leaves one row`() {
        val (community, viewer) = aCommunityWithOwner("Raced Round")

        // Same round, two announcements. The second must not overwrite the first: ON CONFLICT DO
        // NOTHING, then read the winner's row.
        val first = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val second = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        second.game shouldBe first.game
        val edition = requireNotNull(editionRepository.findActiveByCommunityId(requireNotNull(community.id)))
        rounds.historyOf(editionId = requireNotNull(edition.id), after = Int.MIN_VALUE) shouldHaveSize 1
    }

    @Test
    fun `a round announced with a game type this build lacks has no game but still has its round`() {
        val (community, viewer) = aCommunityWithOwner("Unknown Type Round")
        val edition = requireNotNull(editionRepository.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)

        // Pre-inserted directly, bypassing selection/draw entirely: this is what a round announced
        // by a deployment carrying a game type this build no longer has would look like. The only
        // way `currentRound` can reflect "not-a-real-game" is by reading this row, not by drawing.
        store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "not-a-real-game",
            params = mapper.readTree("{}"), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = clock.instant(),
        )

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.noGameReason shouldBe NoGameReason.NO_GAME_TYPE
        res.round.shouldNotBeNull()
        res.game.shouldBeNull()
    }
}
