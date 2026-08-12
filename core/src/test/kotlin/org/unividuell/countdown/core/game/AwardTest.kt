package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.Phase
import org.unividuell.countdown.core.game.internal.awardFor
import java.util.UUID

class AwardTest {

    @Test
    fun `without a phase-two threshold every round is phase one and worth one point`() {
        for (round in listOf(30, 5, 0, -3)) {
            Phase.of(roundNumber = round, phaseTwoStartRound = null) shouldBe Phase.ONE
            val award = awardFor(roundNumber = round, phaseTwoStartRound = null)
            award.rule shouldBe AwardRule.ALL_QUALIFYING
            award.points shouldBe 1
        }
    }

    @Test
    fun `phase two starts at the threshold and stays, because later in time is a smaller number`() {
        Phase.of(roundNumber = 21, phaseTwoStartRound = 20) shouldBe Phase.ONE
        Phase.of(roundNumber = 20, phaseTwoStartRound = 20) shouldBe Phase.TWO
        Phase.of(roundNumber = 0, phaseTwoStartRound = 20) shouldBe Phase.TWO
        Phase.of(roundNumber = -1, phaseTwoStartRound = 20) shouldBe Phase.TWO
    }

    @Test
    fun `the stake grows by one per round from the threshold on`() {
        // The value table from huettehuette's `pointsOfRound`, threshold 20:
        // round   21, 20, 19, 18, …,  1,  0, -1
        // points   1,  2,  3,  4, …, 21, 22, 23
        val expected = mapOf(21 to 1, 20 to 2, 19 to 3, 18 to 4, 5 to 17, 1 to 21, 0 to 22, -1 to 23)
        for ((round, points) in expected) {
            awardFor(roundNumber = round, phaseTwoStartRound = 20).points shouldBe points
        }
    }

    @Test
    fun `phase two is winner takes it all`() {
        awardFor(roundNumber = 20, phaseTwoStartRound = 20).rule shouldBe AwardRule.CLOSEST_ONLY
        awardFor(roundNumber = 21, phaseTwoStartRound = 20).rule shouldBe AwardRule.ALL_QUALIFYING
    }

    @Test
    fun `phase and award turn over at the same round`() {
        // One predicate behind both, so a raised tolerance can never disagree with a raised stake.
        for (round in 25 downTo -5) {
            val phase = Phase.of(roundNumber = round, phaseTwoStartRound = 20)
            val rule = awardFor(roundNumber = round, phaseTwoStartRound = 20).rule
            when (phase) {
                Phase.ONE -> rule shouldBe AwardRule.ALL_QUALIFYING
                Phase.TWO -> rule shouldBe AwardRule.CLOSEST_ONLY
            }
        }
    }

    @Test
    fun `the edition overload reads the threshold off the run`() {
        val edition = CommunityEdition(
            communityId = UUID.randomUUID(), label = "Run 2026", phaseTwoStartRound = 20,
        )

        Phase.of(edition = edition, roundNumber = 20) shouldBe Phase.TWO
        Phase.of(edition = edition, roundNumber = 21) shouldBe Phase.ONE
    }
}
