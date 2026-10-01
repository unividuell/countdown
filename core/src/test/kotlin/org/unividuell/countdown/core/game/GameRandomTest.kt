package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import java.security.SecureRandom

class GameRandomTest {

    @Test
    fun `fromSeed's three streams draw three different first values`() {
        // The salts are the only thing keeping the lab's derived streams apart. Were one 0, or the
        // derivation "simplified" back to one seed, two streams would draw the same first double —
        // the failure a field-set test cannot see, because it narrows a value rather than adding one.
        val random = GameRandom.fromSeed(4711)

        setOf(
            random.solution.nextDouble(),
            random.presentation.nextDouble(),
            random.scene.nextDouble(),
        ) shouldHaveSize 3
    }

    @Test
    fun `independent seeds all three streams`() {
        val random = GameRandom.independent(SecureRandom())

        setOf(
            random.solution.nextDouble(),
            random.presentation.nextDouble(),
            random.scene.nextDouble(),
        ) shouldHaveSize 3
    }
}
