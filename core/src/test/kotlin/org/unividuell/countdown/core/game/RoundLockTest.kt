package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.longs.shouldBeGreaterThan
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Deliberately **no** `@Transactional`: a lock between two transactions is only observable if there
 * are two, and a class-level `@Transactional` here would wrap the single test method in one
 * transaction that both "concurrent" transactions then share, defeating the point.
 *
 * The flip side: nothing this test does gets rolled back. The fixture cleans up its own rows by hand
 * in a `finally` block, because they land in the same database every other test in the suite shares.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class RoundLockTest(
    @Autowired val rounds: RoundGameRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val transactions: TransactionTemplate,
    @Autowired val mapper: ObjectMapper,
) {

    @Test
    fun `the second transaction waits for the first to release the round`() {
        val creator = requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "locker")).id)
        val community = communities.save(
            Community(name = "Lock Round", slug = "lock-round-${System.nanoTime()}", createdBy = creator),
        )
        val communityId = requireNotNull(community.id)
        val edition = editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))
        val editionId = requireNotNull(edition.id)
        val round = store.announce(
            edition = edition, roundNumber = 12, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":1.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = Instant.parse("2026-08-12T10:00:00Z"),
        )
        val id = requireNotNull(round.id)
        val holding = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)

        try {
            val holder = pool.submit {
                transactions.execute {
                    // Through the wrapper, not the repository directly: `store.lock` is what Task 5's
                    // guess flow actually calls, so this is the one place its own logic — unwrapping
                    // the id, returning the fetched row — gets exercised on the real serialisation path.
                    val locked = store.lock(round)
                    locked.id shouldBe id
                    locked.roundNumber shouldBe round.roundNumber
                    locked.gameType shouldBe round.gameType
                    holding.countDown()
                    // Held on purpose: without the lock the waiter below returns immediately, and
                    // "immediately" is the failure this test is looking for.
                    Thread.sleep(400)
                }
            }
            val waited = pool.submit<Long> {
                holding.await(5, TimeUnit.SECONDS)
                val startedAt = System.nanoTime()
                // Deliberately the repository, not the wrapper: the waiter's job is only to observe
                // that the lock is held, so the timing assertion below is about the lock, not the
                // wrapper around it.
                transactions.execute { rounds.findByIdForUpdate(id) }
                (System.nanoTime() - startedAt) / 1_000_000
            }

            waited.get(30, TimeUnit.SECONDS) shouldBeGreaterThan 200L
            holder.get(30, TimeUnit.SECONDS)
        } finally {
            pool.shutdownNow()
            // Deliberately non-transactional (see the class comment), so every row this test commits
            // has to be torn down by hand — a global count elsewhere in the suite (an active edition
            // per community, say) would otherwise see this test's fixture as real data forever.
            // FK order: round game before edition before community before user.
            rounds.deleteById(id)
            editions.deleteById(editionId)
            communities.deleteById(communityId)
            users.deleteById(creator)
        }
    }

    @Test
    fun `locking a round that vanished throws, naming the round`() {
        val missingId = UUID.randomUUID()
        val ghost = RoundGame(
            id = missingId,
            editionId = UUID.randomUUID(),
            roundNumber = 1,
            gameType = "guess-hue",
            params = mapper.readTree("""{"hue":1.0}"""),
            awardRule = AwardRule.ALL_QUALIFYING,
            awardPoints = 1,
            announcedAt = Instant.parse("2026-08-12T10:00:00Z"),
        )

        val thrown = shouldThrow<IllegalArgumentException> { store.lock(ghost) }
        thrown.message shouldContain missingId.toString()
    }
}
