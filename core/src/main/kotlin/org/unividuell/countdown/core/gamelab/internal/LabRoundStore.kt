package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.Verdict
import org.unividuell.countdown.core.game.pointsFor
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * The round a lab session is playing: **chosen**, not materialised, but frozen exactly like a real one
 * once chosen. [params] is the drawn round including its solution, [award] the stake its phase implies
 * — both from the same functions the real round uses, so what the lab shows is what the game shows.
 */
data class LabRound(val seed: Int, val phase: Phase, val params: JsonNode, val award: Award)

/**
 * One tester's guess, with the game's verdict and the points the framework awarded for it.
 *
 * [points] is not nullable here, unlike the real game's column: a lab entry exists only because
 * somebody guessed, and the round is re-scored in the same call — there is no "revealed but not
 * guessed" state to keep apart.
 */
data class LabEntry(
    val userId: UUID,
    val guess: JsonNode,
    val qualifies: Boolean,
    val deviation: Double,
    val outcome: GameOutcome?,
    val points: Int,
    /** Display order only — never a score. */
    val at: Instant,
    /** The stage this tester's entry was recorded at — the lab's stand-in for round_plays.stage. */
    val stage: Int,
    /**
     * How long this tester took, from their first `open` of this round to this guess. `null` for a
     * round whose game does not score on time. The lab's stand-in for `revealed_at → guessed_at`:
     * the lab shows no sealed face, so *landing on the round* is what starts the clock here.
     */
    val durationMs: Long?,
)

/** The state of a lab round after an operation, plus whether that operation displaced another round. */
data class LabRoundSnapshot(
    val round: LabRound,
    val entries: List<LabEntry>,
    val tookOverRound: Boolean,
)

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
 * It holds **exactly one round per (community, game)**. A request carrying a different seed **or**
 * phase discards the previous round. That is what bounds the memory: one round per key, at most one
 * entry per member — no TTL, no cap, nothing to maintain.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabRoundStore(private val clock: Clock) {

    private data class Key(val communityId: UUID, val gameId: String)

    private class Round(val frozen: LabRound) {
        val entries = ConcurrentHashMap<UUID, LabEntry>()
        /** Insertion order for the entry list; ConcurrentHashMap has none, and `at` can collide. */
        val sequence = ConcurrentHashMap<UUID, Long>()
        val counter = AtomicLong()
        /** Per-tester staged progress — the lab's stand-in for round_plays.stage. */
        val stages = ConcurrentHashMap<UUID, Int>()
        /** First open per tester — the lab's `revealed_at`. A reload must not restart it. */
        val openedAt = ConcurrentHashMap<UUID, Instant>()
        /** Produced once per lab round, lazily — one ladder per (community, game), self-limiting. */
        @Volatile var assets: Map<Int, RoundAsset>? = null
    }

    private val rounds = ConcurrentHashMap<Key, Round>()

    fun open(communityId: UUID, gameId: String, round: LabRound): LabRoundSnapshot {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        // Same lock as record()/forget()/resetRound(): otherwise a read racing one of those writes
        // could return a torn snapshot — some entries already rescored, some not yet.
        synchronized(stored) {
            return stored.snapshot(tookOver)
        }
    }

    /**
     * The round a request for [requested] will play, without creating or evicting anything: the
     * stored round if its seed and phase match [requested], `requested` itself otherwise. The
     * comparison is the same one [openRound] uses to decide whether to evict, kept in one place
     * ([matches]) so the two can never disagree about which round a request belongs to.
     *
     * `LabService.guess` judges against this instead of mutating first — judging must not be able to
     * change what round is stored, or a guess rejected for a stale seed/phase would destroy another
     * tester's in-progress round along with it. When nothing is stored yet, "play `requested`" is
     * exactly what [record] is about to store anyway, so there is no third case to handle.
     */
    fun roundFor(communityId: UUID, gameId: String, requested: LabRound): LabRound {
        val stored = rounds[Key(communityId, gameId)]?.frozen
        return if (stored != null && matches(stored, requested)) stored else requested
    }

    /**
     * The tester's current stage — `0` for a tester who has neither guessed nor advanced yet, or
     * whose request no longer matches the stored round. A peek, like [roundFor]: it must not evict —
     * `guess()` reads this before its own [record] call decides whether *that* call is the one taking
     * over the round, and a mutating read here would silently hand the takeover to this call instead.
     */
    fun stageOf(communityId: UUID, gameId: String, round: LabRound, userId: UUID): Int {
        val stored = rounds[Key(communityId, gameId)] ?: return 0
        if (!matches(stored.frozen, round)) return 0
        synchronized(stored) {
            return stored.stages[userId] ?: 0
        }
    }

    /**
     * Start this tester's clock, once. `putIfAbsent`, so a reload keeps the first stamp — the same
     * property `revealed_at` has in a real round.
     */
    fun markOpened(communityId: UUID, gameId: String, round: LabRound, userId: UUID) {
        val (stored, _) = openRound(Key(communityId, gameId), round)
        synchronized(stored) {
            stored.openedAt.putIfAbsent(userId, clock.instant())
        }
    }

    /**
     * Whether this tester has already started their clock on this round — a peek, like [stageOf]: it
     * must not evict, and it reads `false` for a request whose seed/phase no longer matches the
     * stored round, the same as [stageOf].
     */
    fun hasOpened(communityId: UUID, gameId: String, round: LabRound, userId: UUID): Boolean {
        val stored = rounds[Key(communityId, gameId)] ?: return false
        if (!matches(stored.frozen, round)) return false
        synchronized(stored) {
            return stored.openedAt.containsKey(userId)
        }
    }

    /** true when the expected stage still held — the same zero-rows idiom, in memory. */
    fun advanceStage(communityId: UUID, gameId: String, round: LabRound, userId: UUID, expected: Int): Boolean {
        val (stored, _) = openRound(Key(communityId, gameId), round)
        // Same lock as record(): a raced skip or a raced wrong guess must not both advance the stage.
        synchronized(stored) {
            if ((stored.stages[userId] ?: 0) != expected) return false
            stored.stages[userId] = expected + 1
            return true
        }
    }

    /** Lazily produced, then cached on the round. [produce] runs outside any DB — pure lab memory. */
    fun assetsOf(
        communityId: UUID,
        gameId: String,
        round: LabRound,
        produce: () -> Map<Int, RoundAsset>,
    ): Map<Int, RoundAsset> {
        val (stored, _) = openRound(Key(communityId, gameId), round)
        synchronized(stored) {
            val existing = stored.assets
            if (existing != null) return existing
            val produced = produce()
            stored.assets = produced
            return produced
        }
    }

    fun record(
        communityId: UUID,
        gameId: String,
        round: LabRound,
        userId: UUID,
        guess: JsonNode,
        judgement: Judgement,
        /**
         * Whether this round ranks on the clock. The answer comes from `GameType.requiresReveal` via
         * [LabService] — the store does not ask a game anything. It is passed in rather than derived
         * so the duration is computed exactly once here, and the entry's `durationMs` and the
         * `deviation` the rescore ranks on can never be two different numbers.
         */
        timed: Boolean,
    ): RecordResult {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        // The lab's stand-in for the real game's row lock on the round (see game-rounds.md, "whoever
        // writes other rows must serialise"): rescore() reads every entry and writes every entry
        // back, so two concurrent testers guessing into the same round must not interleave, or both
        // could end up holding a CLOSEST_ONLY stake. The same lock also keeps this from racing
        // forget()/resetRound(), which mutate the same two maps.
        synchronized(stored) {
            val at = clock.instant()
            val durationMs = stored.openedAt[userId]?.let { Duration.between(it, at).toMillis() }
            val entry = LabEntry(
                userId = userId,
                guess = guess,
                qualifies = judgement.qualifies,
                deviation = if (timed && durationMs != null) durationMs.toDouble() else judgement.deviation,
                outcome = judgement.outcome,
                // Overwritten by the rescore below. A lone entry is scored by the same function as a
                // full round rather than by a shortcut, so the two can never disagree.
                points = 0,
                at = at,
                stage = stored.stages[userId] ?: 0,
                durationMs = if (timed) durationMs else null,
            )
            // putIfAbsent, not put: one guess per player and round is the real game's rule, enforced
            // here so the lab exercises it. Repeating a round is what the two reset actions are for.
            if (stored.entries.putIfAbsent(userId, entry) != null) return RecordResult.AlreadyGuessed
            stored.sequence[userId] = stored.counter.getAndIncrement()
            stored.rescore()
            return RecordResult.Recorded(stored.snapshot(tookOver))
        }
    }

    fun resetRound(communityId: UUID, gameId: String, round: LabRound): LabRoundSnapshot {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        // Same lock as record(): clearing must not interleave with a concurrent record()/forget() on
        // the same round, or a write either side is in the middle of could be lost or resurrected.
        synchronized(stored) {
            stored.entries.clear()
            stored.sequence.clear()
            // Everybody replays from stage 0 — a reset that kept old stages would let a tester who
            // had advanced skip straight past assets a fresh player has not unlocked yet.
            stored.stages.clear()
            stored.openedAt.clear()
            return stored.snapshot(tookOver)
        }
    }

    fun forget(communityId: UUID, gameId: String, round: LabRound, userId: UUID): LabRoundSnapshot {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        // Same lock as record(): otherwise a rescore() racing this removal could re-insert the entry
        // that is being forgotten, and the forgotten user would come back as `AlreadyGuessed`.
        synchronized(stored) {
            stored.entries.remove(userId)
            stored.sequence.remove(userId)
            // The forgotten tester is back in front of the gate at stage 0 too — otherwise deleting a
            // guess would still leave them standing on whatever stage they had advanced to.
            stored.stages.remove(userId)
            stored.openedAt.remove(userId)
            // Whoever leaves changes the standings of whoever stays: under CLOSEST_ONLY the best
            // remaining guess takes the stake. Same reason the real game re-evaluates on every write.
            stored.rescore()
            return stored.snapshot(tookOver)
        }
    }

    /**
     * Re-score the whole round, exactly like the real game's re-evaluation: `points` is a function of
     * the frozen award rule and **every** verdict of the round, which is why "a later guess takes an
     * earlier one's points away" needs no mechanism for taking points away.
     */
    private fun Round.rescore() {
        val points = pointsFor(
            award = frozen.award,
            verdicts = entries.values.map {
                Verdict(id = it.userId, qualifies = it.qualifies, deviation = it.deviation)
            },
        )
        for ((userId, entry) in entries) {
            entries[userId] = entry.copy(points = points[userId] ?: 0)
        }
    }

    private fun openRound(key: Key, round: LabRound): Pair<Round, Boolean> {
        var tookOver = false
        val stored = rounds.compute(key) { _, existing ->
            // Seed *and* phase are the round key now: switching the phase chooses a different round,
            // with a different award, so the previous one cannot be kept.
            if (existing != null && matches(existing.frozen, round)) {
                existing
            } else {
                tookOver = existing != null
                Round(round)
            }
        }!!
        return stored to tookOver
    }

    /** The one predicate for "same round": shared by [openRound]'s eviction and [roundFor]'s lookup. */
    private fun matches(stored: LabRound, requested: LabRound): Boolean =
        stored.seed == requested.seed && stored.phase == requested.phase

    private fun Round.snapshot(tookOver: Boolean) = LabRoundSnapshot(
        round = frozen,
        entries = entries.values.sortedBy { sequence[it.userId] ?: Long.MAX_VALUE },
        tookOverRound = tookOver,
    )
}
