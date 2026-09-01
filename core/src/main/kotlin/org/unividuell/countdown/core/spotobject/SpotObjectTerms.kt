package org.unividuell.countdown.core.spotobject

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * The curated list of things to go looking for. The module's public surface: the game framework's
 * adapter gets this bean and draws its round from it.
 *
 * A term earns its place by being **worldwide** and **recognisable in the picture**. Something that
 * exists in one culture only turns the search into local knowledge; something you must stand next
 * to turns it into an argument.
 *
 * Immutable and stateless — the randomness lives in the [SeededRandom] passed in, never here.
 */
class SpotObjectTerms(val terms: List<String>) {

    /**
     * Drawn from the **presentation** stream, which is the whole of this game's draw: the term is
     * published in the payload, and there is no second, withheld value for it to narrow.
     *
     * That the list is secret anyway is not a contradiction — the seeds come from
     * `GameRandom.independent`, not from round coordinates, so owning the list still does not tell
     * anybody which term comes tomorrow.
     */
    fun draw(presentation: SeededRandom): String = presentation.pick(terms)
}
