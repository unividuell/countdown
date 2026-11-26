package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameWeight
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.roundToInt

/**
 * Which game a round gets.
 *
 * A pure function over the candidates and the run's history, and it receives the **whole** history
 * rather than just the previous round on purpose: "not within the last three", even distribution and
 * weighting all live in that list already, so the next rule is a change here and nowhere else. Had
 * the resolution passed only the previous type, every one of those would have meant changing the
 * query, the service and their tests.
 *
 * `null` means no type is available. Filtering [candidates] — a game whose content a community has
 * not provided yet — happens **before** the call and does not touch the rule either. The community's
 * [GameWeight]s are an input, not a filter: what `OFF` means if nothing else is left is the rule's call.
 */
fun interface GameSelection {
    /** [history] is most-recently-played first; a candidate missing from [weights] is [GameWeight.NORMAL]. */
    fun pick(
        candidates: List<String>,
        history: List<PastRound>,
        weights: Map<String, GameWeight>,
        random: SeededRandom,
    ): String?
}

/**
 * The games of the last rounds are blocked; the next one is drawn uniformly from the rest.
 *
 * With 14 candidates on [GameWeight.NORMAL] the last 10 rounds block, 4 stay free. Uniform choice gave
 * each game 5 to 15 rounds over an edition of 140; this keeps every game within 8 to 12 in about 95 %
 * of editions. A game arriving mid-edition is unblocked, comes up soon and then runs with the others —
 * it does not catch up. That the next game becomes guessable is fine: which game comes is no secret.
 *
 * Weights stretch or shrink a game's own block: `often` 3× shorter, `rare` 3× longer, which over 140
 * rounds lands often at about twice, rare at about half as many rounds as normal. Scaled by the mean
 * factor, so about [UNBLOCKED] games stay free whatever the mix — all games on one stage play exactly
 * as all normal. Without it all-often was near pure chance and all-rare blocked everything, repeating
 * games back to back. `OFF` drops the game.
 *
 * At least the previous round blocks, so a catalogue of up to five falls back to "not twice in a
 * row". A **preference, not an exclusion criterion** — if honouring it would leave nothing, the rule
 * drops rather than the round losing its game: all off plays as none off, nothing free still avoids
 * the previous round.
 */
@Component
class NotRecentlyPlayed : GameSelection {
    override fun pick(
        candidates: List<String>,
        history: List<PastRound>,
        weights: Map<String, GameWeight>,
        random: SeededRandom,
    ): String? {
        if (candidates.isEmpty()) return null

        fun weightOf(id: String) = weights[id] ?: GameWeight.NORMAL

        val on = candidates.filterNot { weightOf(it) == GameWeight.OFF }.ifEmpty { candidates }

        // e.g. 14 on, 1 often: mean factor 16/14 → often blocks 4 rounds, normal 11.
        val base = maxOf(1, on.size - UNBLOCKED)
        val meanFactor = on.map { weightOf(it).factor.takeIf { f -> f > 0 } ?: 1.0 }.average()
        val free = on.filterNot { id ->
            val factor = weightOf(id).factor.takeIf { it > 0 } ?: 1.0
            val blockedRounds = maxOf(1, (base * meanFactor / factor).roundToInt())

            // A type no longer available still takes its slot in the history.
            history.take(blockedRounds).any { it.gameType == id }
        }
        if (free.isNotEmpty()) return random.pick(free)

        val previous = history.firstOrNull()?.gameType
        return random.pick(on.filterNot { it == previous }.ifEmpty { on })
    }

    companion object {
        /** How many candidates the block leaves free. Fewer is more even but closer to a fixed cycle. */
        const val UNBLOCKED = 4
    }
}
