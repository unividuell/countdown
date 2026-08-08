package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.node.IntNode
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.gamelab.internal.LabRoundStore
import org.unividuell.countdown.core.gamelab.internal.RecordResult
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private data class TestOutcome(val label: String) : LabOutcome

class LabRoundStoreTest {

    private val clock = Clock.fixed(Instant.parse("2026-08-08T12:00:00Z"), ZoneOffset.UTC)
    private val store = LabRoundStore(clock)
    private val community = UUID.randomUUID()
    private val alice = UUID.randomUUID()
    private val bob = UUID.randomUUID()

    private fun record(user: UUID, seed: Int = 42, value: Int = 1) =
        store.record(community, "sample", seed, user, IntNode(value), TestOutcome("ok"))

    @Test
    fun `opening the same seed twice keeps the round and does not report a takeover`() {
        store.open(community, "sample", 42).tookOverRound shouldBe false
        record(alice)

        val again = store.open(community, "sample", 42)

        again.tookOverRound shouldBe false
        again.seed shouldBe 42
        again.entries.map { it.userId } shouldContainExactly listOf(alice)
    }

    @Test
    fun `a different seed evicts the previous round and reports the takeover`() {
        store.open(community, "sample", 42)
        record(alice)

        val taken = store.open(community, "sample", 99)

        taken.tookOverRound shouldBe true
        taken.seed shouldBe 99
        taken.entries.shouldBeEmpty()
    }

    @Test
    fun `the first open of a key is not a takeover`() {
        // Otherwise every fresh lab visit would claim it had discarded someone's round.
        store.open(community, "sample", 42).tookOverRound shouldBe false
    }

    @Test
    fun `rounds of different games and communities do not evict each other`() {
        store.open(community, "sample", 42)
        record(alice)
        store.open(community, "other", 99)
        store.open(UUID.randomUUID(), "sample", 99)

        val still = store.open(community, "sample", 42)

        still.tookOverRound shouldBe false
        still.entries.map { it.userId } shouldContainExactly listOf(alice)
    }

    @Test
    fun `a second guess by the same user in the same round is refused`() {
        record(alice).shouldBeInstanceOf<RecordResult.Recorded>()

        record(alice, value = 2).shouldBeInstanceOf<RecordResult.AlreadyGuessed>()

        val snapshot = store.open(community, "sample", 42)
        snapshot.entries.map { it.guess.asInt() } shouldContainExactly listOf(1)
    }

    @Test
    fun `resetting the round clears every entry and keeps the seed`() {
        record(alice)
        record(bob)

        val after = store.resetRound(community, "sample", 42)

        after.seed shouldBe 42
        after.entries.shouldBeEmpty()
    }

    @Test
    fun `forgetting one user keeps the others`() {
        record(alice)
        record(bob)

        val after = store.forget(community, "sample", 42, alice)

        after.entries.map { it.userId } shouldContainExactly listOf(bob)
    }

    @Test
    fun `a forgotten user may guess again`() {
        record(alice)
        store.forget(community, "sample", 42, alice)

        record(alice, value = 7).shouldBeInstanceOf<RecordResult.Recorded>()
    }

    @Test
    fun `entries come back in the order they were recorded`() {
        // The list is a play-by-play; a set-ordered list would reshuffle between refreshes.
        record(bob)
        record(alice)

        store.open(community, "sample", 42).entries.map { it.userId } shouldContainExactly
            listOf(bob, alice)
    }

    @Test
    fun `concurrent guessers all land, and each user lands exactly once`() {
        // Two browser windows are real concurrency, not theory.
        val users = List(8) { UUID.randomUUID() }
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(8)
        users.forEach { user ->
            pool.submit {
                start.await()
                repeat(4) { record(user) }
            }
        }
        start.countDown()
        pool.shutdown()
        pool.awaitTermination(10, TimeUnit.SECONDS) shouldBe true

        store.open(community, "sample", 42).entries.map { it.userId }.toSet() shouldBe users.toSet()
        store.open(community, "sample", 42).entries.size shouldBe users.size
    }
}
