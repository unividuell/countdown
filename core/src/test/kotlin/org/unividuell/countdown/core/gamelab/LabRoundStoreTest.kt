package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.IntNode
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.gamelab.internal.LabRound
import org.unividuell.countdown.core.gamelab.internal.LabRoundStore
import org.unividuell.countdown.core.gamelab.internal.RecordResult
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LabRoundStoreTest {

    private val clock = Clock.fixed(Instant.parse("2026-08-08T12:00:00Z"), ZoneOffset.UTC)
    private val store = LabRoundStore(clock)
    private val community = UUID.randomUUID()
    private val alice = UUID.randomUUID()
    private val bob = UUID.randomUUID()
    private val mapper = JsonMapper.builder().build()

    private fun round(seed: Int, phase: Phase = Phase.ONE, rule: AwardRule = AwardRule.ALL_QUALIFYING) =
        LabRound(
            seed = seed,
            phase = phase,
            params = mapper.readTree("""{"seed":$seed}"""),
            award = Award(rule = rule, points = if (rule == AwardRule.ALL_QUALIFYING) 1 else 7),
        )

    private fun judgement(qualifies: Boolean, deviation: Double) =
        Judgement(qualifies = qualifies, deviation = deviation, outcome = null)

    private fun record(user: UUID, seed: Int = 42, value: Int = 1) =
        store.record(
            communityId = community, gameId = "sample", round = round(seed = seed), userId = user,
            guess = IntNode(value), judgement = judgement(qualifies = true, deviation = 0.0), timed = false,
        )

    @Test
    fun `opening the same seed twice keeps the round and does not report a takeover`() {
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .tookOverRound shouldBe false
        record(alice)

        val again = store.open(communityId = community, gameId = "sample", round = round(seed = 42))

        again.tookOverRound shouldBe false
        again.round.seed shouldBe 42
        again.entries.map { it.userId } shouldContainExactly listOf(alice)
    }

    @Test
    fun `a different seed evicts the previous round and reports the takeover`() {
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
        record(alice)

        val taken = store.open(communityId = community, gameId = "sample", round = round(seed = 99))

        taken.tookOverRound shouldBe true
        taken.round.seed shouldBe 99
        taken.entries.shouldBeEmpty()
    }

    @Test
    fun `the first open of a key is not a takeover`() {
        // Otherwise every fresh lab visit would claim it had discarded someone's round.
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .tookOverRound shouldBe false
    }

    @Test
    fun `rounds of different games and communities do not evict each other`() {
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
        record(alice)
        store.open(communityId = community, gameId = "other", round = round(seed = 99))
        store.open(communityId = UUID.randomUUID(), gameId = "sample", round = round(seed = 99))

        val still = store.open(communityId = community, gameId = "sample", round = round(seed = 42))

        still.tookOverRound shouldBe false
        still.entries.map { it.userId } shouldContainExactly listOf(alice)
    }

    @Test
    fun `a second guess by the same user in the same round is refused`() {
        record(alice).shouldBeInstanceOf<RecordResult.Recorded>()

        record(alice, value = 2).shouldBeInstanceOf<RecordResult.AlreadyGuessed>()

        val snapshot = store.open(communityId = community, gameId = "sample", round = round(seed = 42))
        snapshot.entries.map { it.guess.asInt() } shouldContainExactly listOf(1)
    }

    @Test
    fun `resetting the round clears every entry and keeps the seed`() {
        record(alice)
        record(bob)

        val after = store.resetRound(communityId = community, gameId = "sample", round = round(seed = 42))

        after.round.seed shouldBe 42
        after.entries.shouldBeEmpty()
    }

    @Test
    fun `forgetting one user keeps the others`() {
        record(alice)
        record(bob)

        val after = store.forget(
            communityId = community, gameId = "sample", round = round(seed = 42), userId = alice,
        )

        after.entries.map { it.userId } shouldContainExactly listOf(bob)
    }

    @Test
    fun `a forgotten user may guess again`() {
        record(alice)
        store.forget(communityId = community, gameId = "sample", round = round(seed = 42), userId = alice)

        record(alice, value = 7).shouldBeInstanceOf<RecordResult.Recorded>()
    }

    @Test
    fun `entries come back in the order they were recorded`() {
        // The list is a play-by-play; a set-ordered list would reshuffle between refreshes.
        record(bob)
        record(alice)

        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .entries.map { it.userId } shouldContainExactly listOf(bob, alice)
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

        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .entries.map { it.userId }.toSet() shouldBe users.toSet()
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .entries.size shouldBe users.size
    }

    @Test
    fun `a different phase evicts the round just like a different seed does`() {
        val community = UUID.randomUUID()
        store.open(communityId = community, gameId = "guess-hue", round = round(seed = 1))

        val switched = store.open(
            communityId = community, gameId = "guess-hue",
            round = round(seed = 1, phase = Phase.TWO, rule = AwardRule.CLOSEST_ONLY),
        )

        switched.tookOverRound shouldBe true
        switched.round.phase shouldBe Phase.TWO
        switched.entries.shouldBeEmpty()
    }

    @Test
    fun `the round that was stored first is the one that stays`() {
        // "Frozen" means the stored draw wins over anything a later caller offers for the same key:
        // a round must not change under a player who is in the middle of it.
        val community = UUID.randomUUID()
        val first = store.open(communityId = community, gameId = "guess-hue", round = round(seed = 7))

        val again = store.open(
            communityId = community, gameId = "guess-hue",
            round = LabRound(
                seed = 7, phase = Phase.ONE,
                params = mapper.readTree("""{"seed":"tampered"}"""),
                award = Award(rule = AwardRule.CLOSEST_ONLY, points = 99),
            ),
        )

        again.round shouldBe first.round
        again.tookOverRound shouldBe false
    }

    @Test
    fun `phase one gives every qualifying guess the stake`() {
        val community = UUID.randomUUID()
        val r = round(seed = 3)
        val hit = UUID.randomUUID()
        val miss = UUID.randomUUID()
        store.record(
            communityId = community, gameId = "g", round = r, userId = hit,
            guess = mapper.readTree("""{"hue":1}"""),
            judgement = judgement(qualifies = true, deviation = 4.0), timed = false,
        )

        val result = store.record(
            communityId = community, gameId = "g", round = r, userId = miss,
            guess = mapper.readTree("""{"hue":2}"""),
            judgement = judgement(qualifies = false, deviation = 40.0), timed = false,
        )

        val entries = (result as RecordResult.Recorded).snapshot.entries.associateBy { it.userId }
        entries.getValue(hit).points shouldBe 1
        entries.getValue(miss).points shouldBe 0
    }

    @Test
    fun `phase two moves the stake to the later, better guess`() {
        // The reason the lab exists in this shape: CLOSEST_ONLY is only judgeable by hand if one can
        // watch the points move. Same arithmetic as a real round — `pointsFor`, nothing local.
        val community = UUID.randomUUID()
        val r = round(seed = 3, phase = Phase.TWO, rule = AwardRule.CLOSEST_ONLY)
        val early = UUID.randomUUID()
        val late = UUID.randomUUID()
        store.record(
            communityId = community, gameId = "g", round = r, userId = early,
            guess = mapper.readTree("""{"hue":1}"""),
            judgement = judgement(qualifies = true, deviation = 12.0), timed = false,
        )

        val result = store.record(
            communityId = community, gameId = "g", round = r, userId = late,
            guess = mapper.readTree("""{"hue":2}"""),
            judgement = judgement(qualifies = true, deviation = 3.0), timed = false,
        )

        val entries = (result as RecordResult.Recorded).snapshot.entries.associateBy { it.userId }
        entries.getValue(early).points shouldBe 0
        entries.getValue(late).points shouldBe 7
    }

    @Test
    fun `an entry knows how long the tester took, from the first open`() {
        val stepping = SteppingClock(Instant.parse("2026-08-08T12:00:00Z"))
        val store = LabRoundStore(stepping)
        val round = round(seed = 5)
        val tester = UUID.randomUUID()

        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(12))
        val result = store.record(
            communityId = community, gameId = "find-pattern", round = round, userId = tester,
            guess = mapper.readTree("""{"startIndex":3}"""),
            judgement = Judgement(qualifies = true, deviation = 0.0, outcome = null),
            timed = true,
        )

        val entry = (result as RecordResult.Recorded).snapshot.entries.single()
        entry.durationMs shouldBe 12_000L
        // A timed round ranks on the clock: the distance the rescore sees is the duration.
        entry.deviation shouldBe 12_000.0
    }

    @Test
    fun `an untimed round keeps the game's own distance and no duration`() {
        val stepping = SteppingClock(Instant.parse("2026-08-08T12:00:00Z"))
        val store = LabRoundStore(stepping)
        val round = round(seed = 6)
        val tester = UUID.randomUUID()

        store.markOpened(communityId = community, gameId = "guess-hue", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(3))
        val result = store.record(
            communityId = community, gameId = "guess-hue", round = round, userId = tester,
            guess = mapper.readTree("""{"hue":10}"""),
            judgement = Judgement(qualifies = true, deviation = 7.5, outcome = null),
            timed = false,
        )

        val entry = (result as RecordResult.Recorded).snapshot.entries.single()
        entry.durationMs shouldBe null
        entry.deviation shouldBe 7.5
    }

    @Test
    fun `the stamp survives a second open and is dropped by forget`() {
        val stepping = SteppingClock(Instant.parse("2026-08-08T12:00:00Z"))
        val store = LabRoundStore(stepping)
        val round = round(seed = 7)
        val tester = UUID.randomUUID()

        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(20))
        // A reload must not restart the clock — the same rule `revealed_at` follows in a real round.
        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(5))
        val first = store.record(
            communityId = community, gameId = "find-pattern", round = round, userId = tester,
            guess = mapper.readTree("""{"startIndex":3}"""),
            judgement = Judgement(qualifies = true, deviation = 0.0, outcome = null),
            timed = true,
        )
        (first as RecordResult.Recorded).snapshot.entries.single().durationMs shouldBe 25_000L

        store.forget(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(1))
        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(2))
        val again = store.record(
            communityId = community, gameId = "find-pattern", round = round, userId = tester,
            guess = mapper.readTree("""{"startIndex":3}"""),
            judgement = Judgement(qualifies = true, deviation = 0.0, outcome = null),
            timed = true,
        )
        (again as RecordResult.Recorded).snapshot.entries.single().durationMs shouldBe 2_000L
    }

    /** Two instants are the minimum for a duration, and `Clock.fixed` only ever gives one. */
    private class SteppingClock(private var now: Instant) : Clock() {
        override fun instant(): Instant = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
        fun advance(by: Duration) {
            now = now.plus(by)
        }
    }
}
