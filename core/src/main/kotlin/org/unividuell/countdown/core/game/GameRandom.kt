package org.unividuell.countdown.core.game

import org.unividuell.countdown.core.rng.SeededRandom
import java.security.SecureRandom

/**
 * The three independently seeded streams a round is drawn from, split by **publication**:
 * [scene] draws what reaches the client before the reveal, [presentation] what reaches it with or
 * after the reveal, and [solution] only what stays here.
 *
 * Three and not one, because `SeededRandom` is invertible: `nextDouble` publishes 53 bits of two
 * consecutive words, the xoshiro128** transition is a bijection, so a few published doubles pin the
 * generator and let it be run **backwards** past whatever the same stream drew before. Equality of
 * values was never the bar — sharing the stream is.
 *
 * Read [scene] and [presentation] as fully public, [scene] from the moment the round is announced.
 * The game type picked for the round comes from [presentation], because that is announced as well.
 */
class GameRandom(val solution: SeededRandom, val presentation: SeededRandom, val scene: SeededRandom) {

    companion object {
        /**
         * Three draws from a CSPRNG, none stored. `SecureRandom`'s output is not invertible to its
         * state, which is precisely why three seeds may come from one source here while the
         * `SeededRandom`s must never feed each other.
         */
        fun independent(source: SecureRandom) = GameRandom(
            solution = SeededRandom.fromSeed(source.nextInt()),
            presentation = SeededRandom.fromSeed(source.nextInt()),
            scene = SeededRandom.fromSeed(source.nextInt()),
        )

        /**
         * All streams from one visible seed — the lab's constructor, where the seed rides in the URL
         * and nothing is secret anyway. The other two seeds are derived so that one number
         * reproduces a whole round; in production that derivation would be exactly the mistake
         * [independent] avoids, which is why the two factories are separate and named for their use.
         */
        fun fromSeed(seed: Int) = GameRandom(
            solution = SeededRandom.fromSeed(seed),
            presentation = SeededRandom.fromSeed(seed xor PRESENTATION_SALT),
            scene = SeededRandom.fromSeed(seed xor SCENE_SALT),
        )

        /** Arbitrary, fixed: they only have to make the derived streams differ. */
        private const val PRESENTATION_SALT = 0x5F5F5F5F.toInt()
        private const val SCENE_SALT = 0x3C3C3C3C
    }
}
