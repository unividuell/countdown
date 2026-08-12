package org.unividuell.countdown.core.game

import io.kotest.matchers.maps.shouldBeEmpty
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.Verdict
import org.unividuell.countdown.core.game.internal.pointsFor
import java.util.UUID

class ScoringTest {

    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")
    private val carol = UUID.fromString("0190f1b2-0000-7000-8000-000000000003")

    private val phaseOne = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
    private val phaseTwo = Award(rule = AwardRule.CLOSEST_ONLY, points = 7)

    @Test
    fun `every qualifying guess scores in phase one, and the others get a zero rather than nothing`() {
        val points = pointsFor(
            award = phaseOne,
            verdicts = listOf(
                Verdict(playId = alice, qualifies = true, deviation = 9.0),
                Verdict(playId = bob, qualifies = false, deviation = 40.0),
            ),
        )

        // Zero, not absent: the row was played, and the writer must be able to set it back to 0.
        points shouldBe mapOf(alice to 1, bob to 0)
    }

    @Test
    fun `only the closest qualifying guess scores in phase two`() {
        val points = pointsFor(
            award = phaseTwo,
            verdicts = listOf(
                Verdict(playId = alice, qualifies = true, deviation = 12.0),
                Verdict(playId = bob, qualifies = true, deviation = 3.5),
                Verdict(playId = carol, qualifies = false, deviation = 0.5),
            ),
        )

        // Carol is closest but does not qualify — the precondition belongs to the game, and the rule
        // awards among the eligible only.
        points shouldBe mapOf(alice to 0, bob to 7, carol to 0)
    }

    @Test
    fun `a tie gets the full amount twice - it does not split`() {
        val points = pointsFor(
            award = phaseTwo,
            verdicts = listOf(
                Verdict(playId = alice, qualifies = true, deviation = 0.0),
                Verdict(playId = bob, qualifies = true, deviation = 0.0),
            ),
        )

        // Which is also why a pure right/wrong game (deviation 0.0 for every hit) behaves like
        // ALL_QUALIFYING under this rule, without needing a special case.
        points shouldBe mapOf(alice to 7, bob to 7)
    }

    @Test
    fun `if nobody qualifies, nobody scores - under either rule`() {
        val verdicts = listOf(
            Verdict(playId = alice, qualifies = false, deviation = 20.0),
            Verdict(playId = bob, qualifies = false, deviation = 30.0),
        )

        pointsFor(award = phaseOne, verdicts = verdicts) shouldBe mapOf(alice to 0, bob to 0)
        pointsFor(award = phaseTwo, verdicts = verdicts) shouldBe mapOf(alice to 0, bob to 0)
    }

    @Test
    fun `a round nobody has guessed produces no entries at all`() {
        pointsFor(award = phaseTwo, verdicts = emptyList()).shouldBeEmpty()
    }
}
