package org.unividuell.countdown.core.matchscale

/**
 * The loaded categories. The module's public surface; the draw follows with the game adapter.
 *
 * `open`, members too: spring-modulith-observability wraps a module's API beans in a CGLIB subclass.
 */
open class MatchScaleDataset(open val categories: List<MatchScaleCategory>) {

    companion object {
        /** Largest ratio between two silhouettes' real sizes that still makes a fair round. */
        const val MAX_FACTOR = 10.0
    }
}
