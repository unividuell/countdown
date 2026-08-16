package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.rng.SeededRandom

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
 * not provided yet — happens **before** the call and does not touch the rule either.
 */
fun interface GameSelection {
    /** [history] is most-recently-played first. */
    fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String?
}

/**
 * The first and simplest rule: not the same game twice in a row.
 *
 * It is a **preference, not an exclusion criterion** — if honouring it would leave nothing, the rule
 * drops rather than the round losing its game. Today exactly one type exists, so the rule never
 * fires against the real catalogue; that is why its test uses a fake one.
 */
@Component
class DifferentFromPreviousRound : GameSelection {
    override fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String? {
        if (candidates.isEmpty()) return null
        val previous = history.firstOrNull()?.gameType
        val preferred = candidates.filterNot { it == previous }
        return random.pick(preferred.ifEmpty { candidates })
    }
}
