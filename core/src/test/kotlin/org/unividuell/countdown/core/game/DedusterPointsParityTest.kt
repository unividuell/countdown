package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.deduster.DedusterGrid
import org.unividuell.countdown.core.deduster.DedusterPool
import org.unividuell.countdown.core.game.internal.DedusterGameType
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class DedusterPointsParityTest {

    private val mapper = JsonMapper.builder().build()
    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val image = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val game = DedusterGameType(
        pool = mockk<DedusterPool> {
            every { candidates(community) } returns listOf(image)
            every { gridOf(image) } returns DedusterGrid.LANDSCAPE
        },
        images = mockk(),
        store = mockk(),
        mapper = mapper,
    )
    private val params = game.draw(
        random = GameRandom(
            solution = SeededRandom.fromSeed(1),
            presentation = SeededRandom.fromSeed(2),
            scene = SeededRandom.fromSeed(3),
        ),
        context = RoundContext(communityId = community, roundNumber = 12, phase = Phase.ONE),
    ).copy(intervalMs = 1300)

    private val phaseOne = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
    private val phaseTwo = Award(rule = AwardRule.CLOSEST_ONLY, points = 7)

    private fun player(n: Int) = UUID.fromString("0190f1b2-0000-7000-8000-%012d".format(n))

    private fun complete(average: Int) = """{"reactionsMs":${List(48) { average }},"endedBy":"COMPLETE"}"""
    private fun tooLate(tiles: Int, average: Int) = """{"reactionsMs":${List(tiles) { average }},"endedBy":"TOO_LATE"}"""

    private fun pointsOf(award: Award, runs: List<String>): List<Int> {
        val verdicts = runs.mapIndexed { at, body ->
            val judgement = game.judge(params = params, guess = mapper.readTree(body))
            Verdict(id = player(at), qualifies = judgement.qualifies, deviation = judgement.deviation)
        }
        val points = pointsFor(award = award, verdicts = verdicts)
        return runs.indices.map { points.getValue(player(it)) }
    }

    /** Each row: the round's runs, the points phase one pays, the points phase two pays. */
    private val table: List<Triple<List<String>, List<Int>, List<Int>>> = listOf(
        // Finishers all score in phase one; the fastest finisher alone in phase two.
        Triple(listOf(complete(300), complete(350)), listOf(1, 1), listOf(7, 0)),
        // Fast but not to the end is worth nothing — `qualifies` is finishing, nothing else.
        Triple(listOf(tooLate(tiles = 20, average = 200), complete(400)), listOf(0, 1), listOf(0, 7)),
        // A tie to the millisecond keeps both, as the original's `best - avg < 0` did.
        Triple(listOf(complete(300), complete(300)), listOf(1, 1), listOf(7, 7)),
        // Nobody makes it: the round pays nothing, in both phases.
        Triple(listOf(tooLate(tiles = 3, average = 300), tooLate(tiles = 0, average = 0)), listOf(0, 0), listOf(0, 0)),
    )

    @Test
    fun `phase one pays every finisher, phase two only the fastest`() {
        for ((runs, one, two) in table) {
            pointsOf(award = phaseOne, runs = runs) shouldBe one
            pointsOf(award = phaseTwo, runs = runs) shouldBe two
        }
    }
}
