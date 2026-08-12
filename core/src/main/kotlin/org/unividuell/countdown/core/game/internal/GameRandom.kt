package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.rng.SeededRandom
import java.security.SecureRandom

/**
 * The two independently seeded streams a round is drawn from, split by **publication**: everything
 * that reaches a client comes from [presentation], and [solution] draws only what stays here.
 *
 * Two and not one, because `SeededRandom` is invertible: `nextDouble` publishes 53 bits of two
 * consecutive words, the xoshiro128** transition is a bijection, so a few published doubles pin the
 * generator and let it be run **backwards** past the solution's own draws. Equality of values was
 * never the bar — sharing the stream is, and a value drawn *before* the solution narrows it just as
 * well as one drawn after.
 *
 * Read [presentation] as fully public. Anything drawn from it may end up in a payload — and the game
 * type picked for the round comes from it too, because that is announced as well.
 */
class GameRandom(val solution: SeededRandom, val presentation: SeededRandom) {

    companion object {
        /**
         * Two draws from a CSPRNG, neither stored. `SecureRandom`'s output is not invertible to its
         * state, which is precisely why two seeds may come from one source here while the two
         * `SeededRandom`s must never feed each other.
         */
        fun independent(source: SecureRandom) = GameRandom(
            solution = SeededRandom.fromSeed(source.nextInt()),
            presentation = SeededRandom.fromSeed(source.nextInt()),
        )
    }
}
