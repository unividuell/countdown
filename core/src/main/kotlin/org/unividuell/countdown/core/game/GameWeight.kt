package org.unividuell.countdown.core.game

/**
 * How often a community wants a game, set by its admin. A game without a stored weight is [NORMAL].
 *
 * [factor] is relative: often against rare only means something next to the other games' stages, so
 * all games on one stage play exactly as all on [NORMAL]. [OFF] takes the game out of the selection.
 */
enum class GameWeight(val factor: Double) {
    OFF(0.0),
    RARE(1.0 / 3),
    NORMAL(1.0),
    OFTEN(3.0),
}
