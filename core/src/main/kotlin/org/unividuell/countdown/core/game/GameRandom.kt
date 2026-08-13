package org.unividuell.countdown.core.game

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

        /**
         * Both streams from one visible seed — the lab's constructor, where the seed rides in the URL
         * and nothing is secret anyway. The presentation seed is derived so that one number
         * reproduces a whole round; in production that derivation would be exactly the mistake
         * [independent] avoids, which is why the two factories are separate and named for their use.
         */
        fun fromSeed(seed: Int) = GameRandom(
            solution = SeededRandom.fromSeed(seed),
            presentation = SeededRandom.fromSeed(seed xor PRESENTATION_SALT),
        )

        /** Arbitrary, fixed: it only has to make the two derived streams differ. */
        private const val PRESENTATION_SALT = 0x5F5F5F5F.toInt()
    }
}
