package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test

class GameRandomTest {

    @Test
    fun `fromSeed's two streams do not draw the same first value`() {
        // PRESENTATION_SALT is the only thing keeping the lab's presentation stream off the solution
        // stream. If it were 0, or the derivation were "simplified" back to one seed, this would draw
        // the same first double from both streams — the failure a field-set test cannot see, because
        // it narrows the answer rather than adding a field.
        val random = GameRandom.fromSeed(4711)

        random.solution.nextDouble() shouldNotBe random.presentation.nextDouble()
    }
}
