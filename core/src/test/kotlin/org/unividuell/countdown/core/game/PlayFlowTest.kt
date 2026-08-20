package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class PlayFlowTest {

    @Test
    fun `a wrong guess below the last stage of an ALL_QUALIFYING round advances`() {
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 0, stages = 5)
            .shouldBe(GuessAction.ADVANCE_STAGE)
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 3, stages = 5)
            .shouldBe(GuessAction.ADVANCE_STAGE)
    }

    @Test
    fun `everything else records`() {
        // correct -> terminal, regardless of stage
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = true, stage = 0, stages = 5)
            .shouldBe(GuessAction.RECORD)
        // last stage -> terminal even when wrong
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 4, stages = 5)
            .shouldBe(GuessAction.RECORD)
        // phase two -> always terminal
        guessActionFor(rule = AwardRule.CLOSEST_ONLY, qualifies = false, stage = 0, stages = 5)
            .shouldBe(GuessAction.RECORD)
        // single-stage game (Guess Hue): there is no "below the last stage"
        guessActionFor(rule = AwardRule.ALL_QUALIFYING, qualifies = false, stage = 0, stages = 1)
            .shouldBe(GuessAction.RECORD)
    }
}
