package org.unividuell.countdown.core.guesshue

/**
 * How far a guess may sit from the target and still be meant as right — inherited mechanics from
 * `huettehuette`, lifted out of prose because the client draws it and must not hard-code it.
 *
 * A half-window: the guess counts from `target - DEGREES` to `target + DEGREES`. Phase 2 of the
 * countdown lifts the tolerance; that is then a number here, not a frontend release.
 *
 * Nothing in this cut *checks* it — it is drawn, not scored. `GuessHueDataset.JITTER_DEGREES` must
 * stay strictly below it, which `GuessHueDrawTest` pins.
 */
object GuessHueTolerance {
    const val DEGREES = 10.0
}
