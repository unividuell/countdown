package org.unividuell.countdown.core.gamelab.internal

/** Unknown community, or the caller is not an active member -> 404 (the two must be indistinguishable). */
class LabAccessDeniedException(message: String = "No access") : RuntimeException(message)

/** No lab game registered under that id -> 404. */
class UnknownLabGameException(message: String) : RuntimeException(message)

/** One guess per player and round, as in the real game -> 409. Use a reset action to play again. */
class AlreadyGuessedException(message: String = "already guessed in this round") : RuntimeException(message)

/** The staged reveal moved under the click (raced skip, raced wrong guess, or the top) -> 409. */
class LabStageMovedOnException(message: String = "the stage has moved on") : RuntimeException(message)

/** The key lies above the tester's stage, or behind a solution gate that is still closed -> 403. */
class LabAssetForbiddenException(message: String = "this asset is not yours to fetch yet") :
    RuntimeException(message)

/** The gate allowed it, but the game has nothing stored under this key -> 404. */
class LabAssetNotFoundException(message: String = "no such asset") : RuntimeException(message)
