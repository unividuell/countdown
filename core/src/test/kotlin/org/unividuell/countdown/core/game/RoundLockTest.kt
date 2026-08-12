package org.unividuell.countdown.core.game

import io.kotest.matchers.longs.shouldBeGreaterThan
import io.kotest.matchers.nulls.shouldNotBeNull
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
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
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
                    rounds.findByIdForUpdate(id).shouldNotBeNull()
                    holding.countDown()
                    // Held on purpose: without the lock the waiter below returns immediately, and
                    // "immediately" is the failure this test is looking for.
                    Thread.sleep(400)
                }
            }
            val waited = pool.submit<Long> {
                holding.await(5, TimeUnit.SECONDS)
                val startedAt = System.nanoTime()
                transactions.execute { rounds.findByIdForUpdate(id) }
                (System.nanoTime() - startedAt) / 1_000_000
            }

            waited.get(30, TimeUnit.SECONDS) shouldBeGreaterThan 200L
            holder.get(30, TimeUnit.SECONDS)
        } finally {
            pool.shutdownNow()
        }
    }
}
