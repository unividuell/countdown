package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.auth.ExternalIdentity
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Two first sign-ins of one identity at once — two tabs, a double click. Not `@Transactional`:
 * both calls run on their own threads, each in its own transaction, as two requests would. Twenty
 * rounds, each with a subject of its own, deleted afterwards.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class UserProvisioningServiceRaceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `two concurrent first sign-ins of one identity make one row`() {
        val pool = Executors.newFixedThreadPool(2)
        try {
            repeat(20) { round ->
                val identity = ExternalIdentity(
                    provider = "github", subject = "race-$round", login = "racer", name = null, email = null,
                )
                val start = CyclicBarrier(2)

                val ids = List(2) {
                    pool.submit<UUID> {
                        start.await()
                        service.provision(identity = identity, roles = emptySet())
                    }
                }.map { it.get(10, TimeUnit.SECONDS) }

                ids.distinct() shouldHaveSize 1
                repository.deleteById(ids.first())
            }
        } finally {
            pool.shutdownNow()
        }
    }
}
