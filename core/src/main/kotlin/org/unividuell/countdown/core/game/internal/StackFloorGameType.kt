package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameScene
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.GuessContext
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.stackfloor.Tower
import org.unividuell.countdown.core.stackfloor.TowerGeometry
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/** The frozen round. [target] is the floor to reach in phase one, `null` in phase two. */
data class StackFloorParams(
    val fieldWidth: Int,
    val startWidth: Int,
    val speedNum: Int,
    val speedDen: Int,
    val pauseMs: Int,
    val maxFloors: Int,
    val hueStart: Int,
    val target: Int?,
    val accelPercent: Int,
    val perfectTolerance: Int,
) {
    fun geometry() = TowerGeometry(
        fieldWidth = fieldWidth, startWidth = startWidth, speedNum = speedNum, speedDen = speedDen,
        accelPercent = accelPercent, perfectTolerance = perfectTolerance, maxFloors = maxFloors,
    )
}

/** What lies under the cover: the field and the foundation's colour. */
data class StackFloorScene(val fieldWidth: Int, val startWidth: Int, val hueStart: Int) : GameScene

data class StackFloorPayload(
    val fieldWidth: Int,
    val startWidth: Int,
    val speedNum: Int,
    val speedDen: Int,
    val pauseMs: Int,
    val maxFloors: Int,
    val hueStart: Int,
    val target: Int?,
    val accelPercent: Int,
    val perfectTolerance: Int,
) : GamePayload

/** Why a run is marked. Stored with the outcome, so the row itself says it. */
enum class StackFloorMark {
    /** The run began after a reload. */
    RESTARTED,

    /** The guess reached the server before the run it claims could have ended. */
    SUBMITTED_BEFORE_RUN_END,
}

data class StackFloorOutcome(val height: Int, val marks: List<StackFloorMark>) : GameOutcome

/** The guess as stored — rebuilt from the checked fields, never the client's node. */
private data class StackFloorGuess(val clicks: List<Int>, val restarted: Boolean)

/**
 * Hochstapler as an announceable game; `stackfloor` knows nothing about it.
 *
 * The client sends click times, never a height: the server rebuilds the tower from them. The
 * ceiling stays what it is for every client-measured game — perfect click times worked out from
 * the payload's geometry are indistinguishable from a perfect player.
 */
@Component
class StackFloorGameType(private val mapper: ObjectMapper) : GameType<StackFloorParams> {

    private val logger = KotlinLogging.logger {}

    override val id = "stack-floor"
    override val displayName = "Hochstapler"
    override val paramsType = StackFloorParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): StackFloorParams {
        val hueStart = random.scene.nextInt(360)
        val target = if (context.phase == Phase.ONE) {
            val jitter = random.presentation.nextIntBetween(min = -2, maxInclusive = 2)

            (targetBase(context.difficulty) + jitter).coerceIn(MIN_TARGET, MAX_TARGET)
        } else {
            null
        }

        return StackFloorParams(
            fieldWidth = FIELD_WIDTH, startWidth = START_WIDTH, speedNum = SPEED_NUM, speedDen = SPEED_DEN,
            pauseMs = PAUSE_MS, maxFloors = MAX_FLOORS, hueStart = hueStart, target = target,
            accelPercent = ACCEL_PERCENT, perfectTolerance = PERFECT_TOLERANCE,
        )
    }

    override fun scene(params: StackFloorParams) =
        StackFloorScene(fieldWidth = params.fieldWidth, startWidth = params.startWidth, hueStart = params.hueStart)

    override fun present(params: StackFloorParams) = StackFloorPayload(
        fieldWidth = params.fieldWidth, startWidth = params.startWidth,
        speedNum = params.speedNum, speedDen = params.speedDen, pauseMs = params.pauseMs,
        maxFloors = params.maxFloors, hueStart = params.hueStart, target = params.target,
        accelPercent = params.accelPercent, perfectTolerance = params.perfectTolerance,
    )

    override fun requiresReveal(params: StackFloorParams) = true

    /** One run, played against the clock of its own bar — not against the span from reveal to guess. */
    override fun scoresOnDuration(params: StackFloorParams) = false

    override fun judge(params: StackFloorParams, guess: JsonNode): Judgement =
        judge(params = params, guess = guess, context = GuessContext(sinceRevealMs = null, playId = null))

    override fun judge(params: StackFloorParams, guess: JsonNode, context: GuessContext): Judgement {
        val clicks = clicksOf(node = guess.get("clicks"), params = params)
        val tower = Tower.build(geometry = params.geometry(), clicks = clicks)

        // Exactly the run a player can have played: it ends on its first miss, or at maxFloors.
        // E.g. [0,0,0] missing on the third click is whole; [0,0,0,0] has a click after the miss.
        val complete = if (tower.missed) {
            tower.height == clicks.size - 1
        } else {
            tower.height == params.maxFloors && clicks.size == params.maxFloors
        }
        if (!complete) throw InvalidGuessException("clicks must end with the first miss or at ${params.maxFloors} floors")

        val restarted = when (val node = guess.get("restarted")) {
            null -> false
            else -> if (node.isBoolean) node.asBoolean() else throw InvalidGuessException("restarted must be a boolean")
        }

        // Every click waits for its bar, and a bar starts a pause after the previous halt. E.g.
        // three clicks at 0 ms: 2 · 300 = 600 ms.
        val since = context.sinceRevealMs
        val earliest = clicks.sumOf { it.toLong() } + (clicks.size - 1).toLong() * params.pauseMs
        val marks = buildList {
            if (restarted) add(StackFloorMark.RESTARTED)
            if (since != null && since < earliest) add(StackFloorMark.SUBMITTED_BEFORE_RUN_END)
        }

        if (marks.isNotEmpty()) {
            val timing = since?.let { ": arrived $it ms after its reveal, ran at least $earliest ms" } ?: ""
            logger.warn { "stack-floor play ${context.playId ?: "lab"} marked $marks$timing" }
        }

        val target = params.target

        return Judgement(
            qualifies = target == null || tower.height >= target,
            deviation = if (target == null) -tower.height.toDouble() else 0.0,
            guess = mapper.valueToTree(StackFloorGuess(clicks = clicks, restarted = restarted)),
            outcome = StackFloorOutcome(height = tower.height, marks = marks),
        )
    }

    private fun clicksOf(node: JsonNode?, params: StackFloorParams): List<Int> {
        if (node == null || !node.isArray || node.size() == 0) throw InvalidGuessException("clicks must be a non-empty array")
        if (node.size() > params.maxFloors + 1) throw InvalidGuessException("more clicks than a run of ${params.maxFloors} floors has")

        // toList(): JsonNode has its own single-value `map`, which would shadow the Iterable one.
        return node.toList().map { entry ->
            // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
            if (!entry.isIntegralNumber || !entry.canConvertToInt() || entry.asInt() < 0) {
                throw InvalidGuessException("every click must be a non-negative integer of milliseconds")
            }
            entry.asInt()
        }
    }

    companion object {
        const val FIELD_WIDTH = 1000
        const val START_WIDTH = 660
        const val SPEED_NUM = 1
        const val SPEED_DEN = 3

        /** Each floor's bar slides this many percent of floor 0's speed faster. Provisional. */
        const val ACCEL_PERCENT = 3

        /** A stop this many units off still lands perfectly: ±12 ms at the start speed. Provisional. */
        const val PERFECT_TOLERANCE = 4
        const val PAUSE_MS = 300
        const val MAX_FLOORS = 999
        const val MIN_TARGET = 26
        const val MAX_TARGET = 60

        /** The floor to reach around: 0.0 → 26, 0.5 → 43, 1.0 → 60. */
        fun targetBase(difficulty: Double): Int =
            MIN_TARGET + Math.floor(difficulty * (MAX_TARGET - MIN_TARGET)).toInt()
    }
}
