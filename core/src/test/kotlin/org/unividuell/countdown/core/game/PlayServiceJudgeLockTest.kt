package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.spotobject.CountryLookup
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Weltanschauung is the first game whose `judge` talks to a foreign service, and a round's row lock
 * is what every guess, give-up, vote and override of that round queues behind. Held across the
 * lookup, one stalled Google would serialise the whole round — and hold a pooled JDBC connection
 * while doing it.
 *
 * Deliberately **no** `@Transactional`, for the reason [RoundLockTest] spells out: a lock between
 * two transactions is only observable if there are two. The fixture therefore cleans up by hand.
 *
 * The two latches make the test decide rather than time out: the lookup blocks until the second
 * transaction has taken the round's lock, and what is asserted is whether that happened *while the
 * lookup was still running*. A lock held across the lookup makes the probe wait for the guess and
 * the lookup wait for the probe; the wait then expires and the assertion is `false`. No sleep
 * decides anything.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class PlayServiceJudgeLockTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val communityRows: CommunityRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val rounds: RoundGameRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val transactions: TransactionTemplate,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {

    @MockkBean lateinit var countries: CountryLookup

    @Test
    fun `a slow country lookup does not hold the round's row lock`() {
        var ownerId: UUID? = null
        var communityId: UUID? = null
        val judging = CountDownLatch(1)
        val probed = CountDownLatch(1)
        val probedWhileJudging = AtomicBoolean(false)
        val pool = Executors.newFixedThreadPool(2)

        try {
            val (community, owner) = aSpotObjectRound("Slow Lookup ${System.nanoTime()}")
            ownerId = owner
            communityId = requireNotNull(community.id)
            val roundNumber = currentRoundNumberOf(community)
            val roundGameId = roundGameIdOf(community, roundNumber)
            play.reveal(slug = community.slug, userId = owner, isSuperAdmin = false)
            // The stall, at the exact spot Google's two calls sit: it lasts until the other
            // transaction has proven it can take the round.
            every { countries.countryOf(any()) } answers {
                judging.countDown()
                probedWhileJudging.set(probed.await(10, TimeUnit.SECONDS))
                "ES"
            }

            val guessing = pool.submit {
                play.guess(
                    slug = community.slug, userId = owner, isSuperAdmin = false,
                    roundNumber = roundNumber,
                    guess = mapper.readTree("""{"panoId":"abc","heading":12,"pitch":0,"zoom":1}"""),
                )
            }
            val probing = pool.submit {
                judging.await(10, TimeUnit.SECONDS) shouldBe true
                // Would block until the guess's transaction ends if the lock were held across the
                // lookup — and the lookup is waiting for this line, so nothing would ever finish.
                transactions.execute { rounds.findByIdForUpdate(roundGameId) }
                probed.countDown()
            }

            probing.get(30, TimeUnit.SECONDS)
            guessing.get(30, TimeUnit.SECONDS)
            probedWhileJudging.get() shouldBe true
        } finally {
            pool.shutdownNow()
            // Non-transactional, so every row committed here is torn down by hand. Deleting the
            // community cascades to its edition, its round games and their plays; the owner's user
            // row is referenced by ON DELETE RESTRICT and has to follow separately.
            communityId?.let { communityRows.deleteById(it) }
            ownerId?.let { users.deleteById(it) }
        }
    }

    /** A community whose countdown starts in 2099, with a Weltanschauung round announced now. */
    private fun aSpotObjectRound(name: String): Pair<Community, UUID> {
        val ownerId = requireNotNull(
            users.save(User(githubId = System.nanoTime(), githubLogin = "lock-owner")).id,
        )
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        // Announced directly, bypassing selection: this file needs the one game that does I/O.
        store.announce(
            edition = edition, roundNumber = currentRoundNumberOf(community), gameType = "spot-object",
            params = mapper.readTree("""{"term":"Rosa Gartenzwerg","timed":false}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
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

    private fun roundGameIdOf(community: Community, roundNumber: Int): UUID {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return requireNotNull(store.find(edition = edition, roundNumber = roundNumber)?.id)
    }
}
