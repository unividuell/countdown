package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.gamelab.LabOutcome
import java.time.Clock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** One tester's guess in a lab round, together with the outcome the server computed for it. */
data class LabEntry(
    val userId: UUID,
    val guess: JsonNode,
    /** `null` where the game accepts guesses without scoring them. */
    val outcome: LabOutcome?,
    /** Display order only — never a score. Timing is deliberately out of scope for the lab. */
    val at: Instant,
)

/** The state of a lab round after an operation, plus whether that operation displaced another round. */
data class LabRoundSnapshot(val seed: Int, val entries: List<LabEntry>, val tookOverRound: Boolean)

sealed interface RecordResult {
    data class Recorded(val snapshot: LabRoundSnapshot) : RecordResult
    data object AlreadyGuessed : RecordResult
}

/**
 * The lab's whole persistence layer: application-scoped, in memory, never a database row.
 *
 * Application-scoped rather than session-scoped on purpose — a session-bound store would hide
 * every tester's guess from every other tester, which is the one thing multi-player testing needs.
 *
 * It holds **exactly one round per (community, game)**. A request carrying a different seed
 * discards the previous round. That is what bounds the memory: one round per key, at most one
 * entry per member — no TTL, no cap, nothing to maintain.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabRoundStore(private val clock: Clock) {

    private data class Key(val communityId: UUID, val gameId: String)

    private class Round(val seed: Int) {
        val entries = ConcurrentHashMap<UUID, LabEntry>()
        /** Insertion order for the entry list; ConcurrentHashMap has none, and `at` can collide. */
        val sequence = ConcurrentHashMap<UUID, Long>()
        val counter = AtomicLong()
    }

    private val rounds = ConcurrentHashMap<Key, Round>()

    fun open(communityId: UUID, gameId: String, seed: Int): LabRoundSnapshot {
        val (round, tookOver) = openRound(Key(communityId, gameId), seed)
        return round.snapshot(tookOver)
    }

    fun record(
        communityId: UUID,
        gameId: String,
        seed: Int,
        userId: UUID,
        guess: JsonNode,
        outcome: LabOutcome?,
    ): RecordResult {
        val (round, tookOver) = openRound(Key(communityId, gameId), seed)
        val entry = LabEntry(userId, guess, outcome, clock.instant())
        // putIfAbsent, not put: one guess per player and round is the real game's rule, enforced
        // here so the lab exercises it. Repeating a round is what the two reset actions are for.
        if (round.entries.putIfAbsent(userId, entry) != null) return RecordResult.AlreadyGuessed
        round.sequence[userId] = round.counter.getAndIncrement()
        return RecordResult.Recorded(round.snapshot(tookOver))
    }

    fun resetRound(communityId: UUID, gameId: String, seed: Int): LabRoundSnapshot {
        val (round, tookOver) = openRound(Key(communityId, gameId), seed)
        round.entries.clear()
        round.sequence.clear()
        return round.snapshot(tookOver)
    }

    fun forget(communityId: UUID, gameId: String, seed: Int, userId: UUID): LabRoundSnapshot {
        val (round, tookOver) = openRound(Key(communityId, gameId), seed)
        round.entries.remove(userId)
        round.sequence.remove(userId)
        return round.snapshot(tookOver)
    }

    private fun openRound(key: Key, seed: Int): Pair<Round, Boolean> {
        var tookOver = false
        val round = rounds.compute(key) { _, existing ->
            if (existing != null && existing.seed == seed) existing
            else {
                tookOver = existing != null
                Round(seed)
            }
        }!!
        return round to tookOver
    }

    private fun Round.snapshot(tookOver: Boolean) = LabRoundSnapshot(
        seed = seed,
        entries = entries.values.sortedBy { sequence[it.userId] ?: Long.MAX_VALUE },
        tookOverRound = tookOver,
    )
}
