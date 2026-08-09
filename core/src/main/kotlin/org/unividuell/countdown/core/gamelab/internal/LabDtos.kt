package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.unividuell.countdown.core.gamelab.LabOutcome
import org.unividuell.countdown.core.gamelab.LabPayload
import org.unividuell.countdown.core.gamelab.LabSolution
import org.unividuell.countdown.core.iam.Avatar
import java.time.Instant
import java.util.UUID

data class LabEntryDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val guess: JsonNode,
    val outcome: LabOutcome?,
    val at: Instant,
)

/**
 * Every endpoint answers with this, so the client can redraw after any action without a second
 * request. [tookOverRound] is the only thing the client cannot work out for itself — it does not
 * know which seed the server had stored before this call. [solution] is the only thing it must
 * never work out for itself.
 */
data class LabRoundResponse(
    val seed: Int,
    val game: String,
    val displayName: String,
    val payload: LabPayload,
    /** Filled only once the viewer has an entry of their own; `null` in front of that gate. */
    val solution: LabSolution?,
    val me: LabEntryDto?,
    val others: List<LabEntryDto>,
    val tookOverRound: Boolean,
)
