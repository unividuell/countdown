package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldNotBeNull
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import io.kotest.matchers.shouldBe
import org.springframework.jdbc.UncategorizedSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.anEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Two real transactions, so no `@Transactional` here: one holds the announcement's lock on the
 * edition, the other tries what an admin does meanwhile. Cleans up after itself.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class AnnouncementEditionLockTest(
    @Autowired val rounds: RoundGameRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
    @Autowired val tx: TransactionTemplate,
    @Autowired val jdbc: JdbcTemplate,
) {
    private val created = mutableListOf<Pair<UUID, UUID>>()

    private fun anActiveEdition(): CommunityEdition {
        val owner = requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id)
        val community = communities.create(creatorUserId = owner, rawName = "Lock ${System.nanoTime()}")
        created += requireNotNull(community.id) to owner
        return editions.save(anEdition(communityId = requireNotNull(community.id)))
    }

    @AfterEach
    fun cleanUp() {
        created.forEach { (communityId, owner) ->
            jdbc.update("DELETE FROM community.communities WHERE id = ?", communityId)
            users.deleteById(owner)
        }
    }

    /** Runs [block] in its own transaction while another one holds the announcement's lock on [edition]. */
    private fun <T> whileAnnouncing(edition: CommunityEdition, block: () -> T): T {
        val locked = CountDownLatch(1)
        val release = CountDownLatch(1)
        val announcer = thread {
            tx.executeWithoutResult {
                rounds.lockActiveEdition(requireNotNull(edition.id)).shouldNotBeNull()
                locked.countDown()
                release.await(10, TimeUnit.SECONDS)
            }
        }
        try {
            check(locked.await(10, TimeUnit.SECONDS)) { "announcer never took its lock" }
            return tx.execute {
                jdbc.execute("SET LOCAL lock_timeout = '500ms'")
                block()
            } as T
        } finally {
            release.countDown()
            announcer.join()
        }
    }

    @Test
    fun `an announcement does not hold up an edit`() {
        val edition = anActiveEdition()

        whileAnnouncing(edition) { editions.lockActiveForEditByCommunityId(edition.communityId) }.shouldNotBeNull()
    }

    @Test
    fun `an announcement holds up the archive`() {
        val edition = anActiveEdition()

        val timedOut = shouldThrow<UncategorizedSQLException> {
            whileAnnouncing(edition) { editions.lockActiveByCommunityId(edition.communityId) }
        }

        // lock_not_available: it waited on the announcement until `lock_timeout`.
        timedOut.sqlException?.sqlState shouldBe "55P03"
    }
}
