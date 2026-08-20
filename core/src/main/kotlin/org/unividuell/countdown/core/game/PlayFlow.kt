package org.unividuell.countdown.core.game

/** What the framework does with a judged guess. */
enum class GuessAction { RECORD, ADVANCE_STAGE }

/**
 * Terminal or not — the framework's decision, made without a new flag: a wrong guess below the
 * last stage of an ALL_QUALIFYING round advances the stage instead of recording; everything else
 * records. CLOSEST_ONLY (phase two, frozen on the round) is always terminal — one guess, whatever
 * the stage. Pure and exposed, so the lab replays the exact rule the real round applies — the
 * `pointsFor` precedent.
 */
fun guessActionFor(rule: AwardRule, qualifies: Boolean, stage: Int, stages: Int): GuessAction =
    if (rule == AwardRule.ALL_QUALIFYING && !qualifies && stage < stages - 1) GuessAction.ADVANCE_STAGE
    else GuessAction.RECORD
